import type { JSX } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  AppShell as OxygenAppShell,
  Header,
  Sidebar,
  Footer,
  UserMenu,
  ColorSchemeToggle,
  Divider,
} from "@wso2/oxygen-ui";
import { FileText, Receipt, Users, Wallet, LogOut } from "@wso2/oxygen-ui-icons-react";
import { Can, useAuthz, useHeldRoles } from "../authz/gates";
import { signOut } from "../authz/session";
import { SCREEN_ROUTES } from "../authz/screens";
import { APP_NAME } from "../appName";

// One rail for both roles (thunder-authentication: "the app has ONE rail
// whose items are each wrapped in <Can>", which reproduces the DSL's
// per-role sidebar pictures and also covers a caller holding both roles). Icons
// per screen; NewClaimReview and ClaimReview are reached by navigation, not
// from the rail, exactly as the wireframe draws them.
const ICON_BY_KEY: Record<string, JSX.Element> = {
  myclaims: <FileText />,
  newclaimupload: <Receipt />,
  teamclaims: <Users />,
  weeklylimit: <Wallet />,
};

const RAIL_KEYS = ["myclaims", "newclaimupload", "teamclaims", "weeklylimit"];

export function AppShell(): JSX.Element {
  const { pathname } = useLocation();
  const { username } = useAuthz();
  const roles = useHeldRoles();
  const active = SCREEN_ROUTES.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))?.key;

  return (
    <OxygenAppShell>
      <OxygenAppShell.Navbar>
        <Header>
          <Header.Toggle />
          <Header.Brand>
            <Header.BrandTitle>{APP_NAME}</Header.BrandTitle>
          </Header.Brand>
          <Header.Spacer />
          <Header.Actions>
            <ColorSchemeToggle />
            <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
            <UserMenu>
              <UserMenu.Trigger name={username || "Signed in"} />
              <UserMenu.Header
                name={username || "Signed in"}
                email={roles.length > 0 ? roles.join(", ") : "No role"}
              />
              <UserMenu.Logout icon={<LogOut />} onClick={() => void signOut()} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </OxygenAppShell.Navbar>

      <OxygenAppShell.Sidebar>
        <Sidebar activeItem={active}>
          <Sidebar.Nav>
            <Sidebar.Category>
              {SCREEN_ROUTES.filter((screen) => RAIL_KEYS.includes(screen.key)).map((screen) => (
                <Can key={screen.key} op={screen.loads!}>
                  <Sidebar.Item id={screen.key} link={<Link to={screen.path} />}>
                    <Sidebar.ItemIcon>{ICON_BY_KEY[screen.key]}</Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>{screen.label}</Sidebar.ItemLabel>
                  </Sidebar.Item>
                </Can>
              ))}
            </Sidebar.Category>
          </Sidebar.Nav>
        </Sidebar>
      </OxygenAppShell.Sidebar>

      <OxygenAppShell.Main>
        <Outlet />
      </OxygenAppShell.Main>

      <OxygenAppShell.Footer>
        <Footer>
          <Footer.Copyright>© WSO2 LLC</Footer.Copyright>
        </Footer>
      </OxygenAppShell.Footer>
    </OxygenAppShell>
  );
}
