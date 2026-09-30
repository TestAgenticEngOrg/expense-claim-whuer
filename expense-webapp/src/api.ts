// The typed client for expense-api, this app's primary dependency — reached
// same-origin at /api (nginx reverse-proxies it to the sibling; react-webapp).
// Generated types come from src/generated/expense-api.ts, produced by:
//
//   npx openapi-typescript ../specs/design/components/expense-api/openapi.yaml \
//     -o src/generated/expense-api.ts
//
// Authorization is entirely src/authz/client.ts's: the bearer is attached and
// the 401 rule applied by the middleware below, which calls only
// authorizationHeader() and classifyResponse() — nothing here decides what an
// unauthorized answer means.

import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/expense-api";
import { authorizationHeader, classifyResponse, ForbiddenError } from "./authz/client";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const header = await authorizationHeader();
    if (header) request.headers.set("Authorization", header);
    return request;
  },
  async onResponse({ response }) {
    if ((await classifyResponse(response.status)) === "forbidden") {
      throw new ForbiddenError(response.status);
    }
    return response;
  },
};

export const expenseApi = createClient<paths>({ baseUrl: "/api" });
expenseApi.use(authMiddleware);
