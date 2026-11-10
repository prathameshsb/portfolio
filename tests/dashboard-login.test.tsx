// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OwnerLogin from "../app/owner/OwnerLogin";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("owner password form", () => {
  it("keeps the password field disabled while setup is unavailable", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "unconfigured" }, { status: 503 }));
    render(<OwnerLogin />);
    expect(await screen.findByText(/Owner login has not been configured/)).toBeTruthy();
    expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
  });
  it("submits only password plus same-origin CSRF and clears failed input", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ csrfToken: "synthetic-csrf", authenticated: false }));
    render(<OwnerLogin />);
    await waitFor(() => expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-test-password" } });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "not recognized" }, { status: 401 }));
    fireEvent.submit(screen.getByRole("form", { name: "Owner login" }));
    expect(await screen.findByText("Password not recognized.")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ password: "synthetic-test-password", csrfToken: "synthetic-csrf" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
  });
  it("shows native rate limiting without losing the ability to retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ csrfToken: "synthetic-csrf", authenticated: false }));
    render(<OwnerLogin />);
    await waitFor(() => expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-test-password" } });
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 429 }));
    fireEvent.submit(screen.getByRole("form", { name: "Owner login" }));
    expect(await screen.findByText("Too many attempts. Try again in five minutes.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
