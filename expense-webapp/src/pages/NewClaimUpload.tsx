import { useRef, useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, PageContent, PageTitle, Stack, Typography } from "@wso2/oxygen-ui";
import { Image as ImageIcon, Upload } from "@wso2/oxygen-ui-icons-react";
import { ASSISTANT_ATTACHMENTS, fileToBase64, sendToAssistant } from "../agent";
import { parseReceiptExtraction } from "../parseAgentReply";
import { useClaimDraft } from "./claimDraft";

/**
 * NewClaimUpload — the employee picks a receipt photo. "Continue" sends it to
 * expense-assistant for pre-fill and carries the reply to NewClaimReview
 * (submit-expense-claim.md: upload -> read receipt photo -> amount/date/
 * merchant/category).
 */
export function NewClaimUploadPage(): JSX.Element {
  const navigate = useNavigate();
  const { setDraft } = useClaimDraft();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onPick(event: React.ChangeEvent<HTMLInputElement>): void {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setError(null);
    if (!ASSISTANT_ATTACHMENTS.types.some((type) => picked.type.startsWith(type))) {
      setError("Please choose an image file.");
      return;
    }
    if (picked.size > ASSISTANT_ATTACHMENTS.maxFileSizeMB * 1024 * 1024) {
      setError(`That photo is larger than ${ASSISTANT_ATTACHMENTS.maxFileSizeMB} MB. Choose a smaller one.`);
      return;
    }
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  }

  async function onContinue(): Promise<void> {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const dataUrl = `data:${file.type};base64,${base64}`;
      const reply = await sendToAssistant({
        message: "Read this receipt and extract the claim details.",
        attachments: [{ name: file.name, mediaType: file.type, data: base64 }],
      });
      const extraction = parseReceiptExtraction(reply.text);
      setDraft({ photoDataUrl: dataUrl, photoName: file.name, extraction });
      navigate("/claims/review");
    } catch {
      setError("The assistant could not read that receipt. You can try again, or continue and fill in the details yourself.");
    } finally {
      setSubmitting(false);
    }
  }

  function onContinueWithoutAssistant(): void {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setDraft({
        photoDataUrl: dataUrl,
        photoName: file.name,
        extraction: {
          unreadable: ["amount", "currency", "merchant", "expenseDate", "category"],
        },
      });
      navigate("/claims/review");
    };
    reader.readAsDataURL(file);
  }

  return (
    <PageContent maxWidth={720}>
      <PageTitle>
        <PageTitle.Header>New Expense Claim</PageTitle.Header>
      </PageTitle>

      <Typography sx={{ mb: 2 }}>Upload a photo of your receipt</Typography>

      <Box
        sx={{
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          p: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          mb: 2,
        }}
      >
        {previewUrl ? (
          <Box
            component="img"
            src={previewUrl}
            alt="Receipt"
            sx={{ maxWidth: "100%", maxHeight: 320, borderRadius: 1 }}
          />
        ) : (
          <ImageIcon size={48} />
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ASSISTANT_ATTACHMENTS.types.map((t) => `${t}/*`).join(",")}
          style={{ display: "none" }}
          onChange={onPick}
        />
        <Button variant="outlined" startIcon={<Upload size={18} />} onClick={() => inputRef.current?.click()}>
          {file ? "Choose a different photo" : "Choose Receipt Photo"}
        </Button>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" justifyContent="flex-end" spacing={2}>
        <Button variant="outlined" onClick={() => navigate("/claims")}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!file || submitting} onClick={() => void onContinue()}>
          {submitting ? "Reading receipt…" : "Continue"}
        </Button>
      </Stack>
      {error && file && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button variant="text" onClick={onContinueWithoutAssistant}>
            Continue without the assistant
          </Button>
        </Stack>
      )}
    </PageContent>
  );
}
