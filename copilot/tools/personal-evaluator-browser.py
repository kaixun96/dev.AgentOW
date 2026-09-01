#!/usr/bin/env python3
"""Persistent personal-account browser for long-running visual evaluators."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import (
    BrowserContext,
    Error as PlaywrightError,
    Locator,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)


OWNER_EMAIL = os.environ.get("PERSONAL_EVALUATOR_OWNER_EMAIL", "")
PROFILE_DIR = Path(
    os.environ.get(
        "PERSONAL_EVALUATOR_PROFILE_DIR",
        Path.home() / ".playwright" / "personal-evaluator-profile",
    )
).expanduser()
DEFAULT_OUTPUT_DIR = Path(
    os.environ.get(
        "PERSONAL_EVALUATOR_OUTPUT_DIR",
        Path.home() / ".playwright" / "personal-evaluator-output",
    )
).expanduser()
CAMPAIGN_ROUTE = (
    os.environ.get(
        "PERSONAL_EVALUATOR_CAMPAIGN_ROUTE",
        "https://microsoft.sharepoint-df.com"
        "/_layouts/15/sharepoint.aspx/publish/campaigns",
    )
)
CAMPAIGN_FLIGHTS = os.environ.get(
    "PERSONAL_EVALUATOR_CAMPAIGN_FLIGHTS",
    "61636,62501,62142,62520,62626,1535",
)
AUTHENTICATED_SELECTOR = os.environ.get(
    "PERSONAL_EVALUATOR_AUTHENTICATED_SELECTOR",
    '[data-automation-id="SPH-HomePageView"]',
)
COLOR_SELECTOR = (
    '[data-automation-id="create-campaign-color-selector-component"]'
)
WINDOWS_ACCOUNTS_EXTENSION_ID = "ppnbnpeolgkicgegkbkbjmhlideopiji"
WINDOWS_ACCOUNTS_DIR = (
    Path.home() / ".playwright" / "extensions" / "windows-accounts"
)
WINDOWS_ACCOUNTS_CRX_URL = (
    "https://clients2.google.com/service/update2/crx?"
    + urllib.parse.urlencode(
        {
            "response": "redirect",
            "prodversion": "145.0.0.0",
            "acceptformat": "crx2,crx3",
            "x": f"id={WINDOWS_ACCOUNTS_EXTENSION_ID}&uc",
        }
    )
)


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def campaign_url() -> str:
    return f"{CAMPAIGN_ROUTE}?debugFlights={CAMPAIGN_FLIGHTS}"


def ensure_profile_dir() -> None:
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        PROFILE_DIR.chmod(0o700)
        return

    username = os.environ.get("USERNAME")
    if not username:
        return
    subprocess.run(
        [
            "icacls",
            str(PROFILE_DIR),
            "/inheritance:r",
            "/grant:r",
            f"{username}:(OI)(CI)F",
        ],
        check=False,
        capture_output=True,
        text=True,
    )


def read_varint(data: bytes, offset: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, offset
        shift += 7


def length_delimited_fields(data: bytes) -> list[tuple[int, bytes]]:
    fields: list[tuple[int, bytes]] = []
    offset = 0
    while offset < len(data):
        key, offset = read_varint(data, offset)
        field_number = key >> 3
        wire_type = key & 0x07
        if wire_type == 2:
            length, offset = read_varint(data, offset)
            fields.append((field_number, data[offset : offset + length]))
            offset += length
        elif wire_type == 0:
            _, offset = read_varint(data, offset)
        elif wire_type == 1:
            offset += 8
        elif wire_type == 5:
            offset += 4
        else:
            raise RuntimeError(f"Unsupported CRX protobuf wire type: {wire_type}")
    return fields


def extension_id_from_key(public_key: bytes) -> str:
    digest = hashlib.sha256(public_key).digest()[:16]
    return "".join(chr(ord("a") + nibble) for byte in digest for nibble in (byte >> 4, byte & 0x0F))


def unpack_crx3(crx: bytes) -> tuple[bytes, bytes]:
    if crx[:4] != b"Cr24" or struct.unpack("<I", crx[4:8])[0] != 3:
        raise RuntimeError("Windows Accounts download was not a CRX3 package.")
    header_size = struct.unpack("<I", crx[8:12])[0]
    header = crx[12 : 12 + header_size]
    zip_payload = crx[12 + header_size :]

    for field, proof in length_delimited_fields(header):
        if field not in (2, 3):
            continue
        public_key = next(
            (
                value
                for proof_field, value in length_delimited_fields(proof)
                if proof_field == 1
            ),
            None,
        )
        if (
            public_key
            and extension_id_from_key(public_key)
            == WINDOWS_ACCOUNTS_EXTENSION_ID
        ):
            return public_key, zip_payload
    raise RuntimeError(
        "CRX3 package did not contain the expected extension public key."
    )


def ensure_windows_accounts_extension() -> None:
    manifest_path = WINDOWS_ACCOUNTS_DIR / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        key = base64.b64decode(manifest.get("key", ""))
        if key and extension_id_from_key(key) == WINDOWS_ACCOUNTS_EXTENSION_ID:
            return

    with urllib.request.urlopen(WINDOWS_ACCOUNTS_CRX_URL, timeout=60) as response:
        public_key, zip_payload = unpack_crx3(response.read())
    actual_id = extension_id_from_key(public_key)
    if actual_id != WINDOWS_ACCOUNTS_EXTENSION_ID:
        raise RuntimeError(
            f"Windows Accounts extension ID mismatch: {actual_id}"
        )

    temporary_dir = WINDOWS_ACCOUNTS_DIR.with_name(
        f"{WINDOWS_ACCOUNTS_DIR.name}.tmp"
    )
    shutil.rmtree(temporary_dir, ignore_errors=True)
    temporary_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(zip_payload)) as archive:
        archive.extractall(temporary_dir)

    manifest_path = temporary_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["key"] = base64.b64encode(public_key).decode("ascii")
    manifest_path.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    shutil.rmtree(WINDOWS_ACCOUNTS_DIR, ignore_errors=True)
    temporary_dir.replace(WINDOWS_ACCOUNTS_DIR)


def launch_context(playwright: Any, *, headed: bool) -> BrowserContext:
    ensure_profile_dir()
    ensure_windows_accounts_extension()
    try:
        return playwright.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=not headed,
            viewport={"width": 1440, "height": 1000},
            ignore_default_args=["--disable-extensions"],
            args=[
                "--no-first-run",
                f"--disable-extensions-except={WINDOWS_ACCOUNTS_DIR}",
                f"--load-extension={WINDOWS_ACCOUNTS_DIR}",
            ],
        )
    except Exception as error:
        message = str(error)
        if "Executable doesn't exist" in message:
            raise RuntimeError(
                "Playwright Chromium is missing. Run: playwright install chromium"
            ) from error
        if "ProcessSingleton" in message or "profile" in message.lower():
            raise RuntimeError(
                "The personal evaluator profile is already in use. Close its browser "
                "window or wait for the current evaluator run to finish."
            ) from error
        raise


def first_page(context: BrowserContext) -> Page:
    page = context.pages[0] if context.pages else context.new_page()
    page.set_default_timeout(10_000)
    return page


def prefill_owner_email(page: Page) -> None:
    if not OWNER_EMAIL:
        return
    email = page.locator('input[type="email"]').first
    try:
        if email.is_visible(timeout=1_000):
            email.fill(OWNER_EMAIL)
            submit = page.locator('input[type="submit"]').first
            if submit.is_visible(timeout=1_000):
                submit.click()
    except PlaywrightTimeoutError:
        return


def authentication_state(page: Page) -> dict[str, str]:
    parsed = urlparse(page.url)
    body = ""
    try:
        body = page.locator("body").inner_text(timeout=2_000)
    except PlaywrightTimeoutError:
        pass

    if parsed.hostname and parsed.hostname.endswith("sharepoint-df.com"):
        try:
            if page.locator(AUTHENTICATED_SELECTOR).is_visible(timeout=2_000):
                return {"state": "authenticated", "detail": ""}
        except PlaywrightTimeoutError:
            pass

    if page.locator('input[type="password"]').count():
        return {"state": "needs-user", "detail": "Enter your password in the browser."}
    if "We couldn't sign you in" in body:
        return {
            "state": "needs-user",
            "detail": "Select 'Sign in another way' and complete Windows Hello/password.",
        }
    if "Approve sign in request" in body:
        return {
            "state": "needs-user",
            "detail": "Approve the Microsoft Authenticator request.",
        }
    if any(
        text in body
        for text in (
            "Verify your identity",
            "Face, fingerprint, PIN or security key",
            "Use your password",
        )
    ):
        return {
            "state": "needs-user",
            "detail": "Choose a sign-in method and complete the credential prompt.",
        }
    return {"state": "waiting", "detail": ""}


def bootstrap(args: argparse.Namespace) -> int:
    deadline = time.time() + args.timeout_minutes * 60
    with sync_playwright() as playwright:
        context = launch_context(playwright, headed=True)
        page = first_page(context)
        page.goto(campaign_url(), wait_until="domcontentloaded", timeout=120_000)
        prefill_owner_email(page)

        last_state = ""
        while time.time() < deadline:
            state = authentication_state(page)
            if state["state"] != last_state:
                emit(
                    {
                        "action": "bootstrap",
                        "state": state["state"],
                        "detail": state["detail"],
                        "url": page.url,
                    }
                )
                last_state = state["state"]
            if state["state"] == "authenticated":
                context.close()
                return 0
            time.sleep(2)

        emit(
            {
                "action": "bootstrap",
                "state": "timeout",
                "detail": "Login did not complete before the bootstrap timeout.",
                "url": page.url,
            }
        )
        context.close()
        return 2


def check_authentication(_: argparse.Namespace) -> int:
    with sync_playwright() as playwright:
        context = launch_context(playwright, headed=False)
        page = first_page(context)
        page.goto(campaign_url(), wait_until="domcontentloaded", timeout=120_000)
        try:
            page.wait_for_selector(AUTHENTICATED_SELECTOR, timeout=45_000)
            state = authentication_state(page)
        except PlaywrightTimeoutError:
            state = authentication_state(page)
        emit(
            {
                "action": "check",
                "state": state["state"],
                "detail": state["detail"],
                "url": page.url,
            }
        )
        context.close()
        return 0 if state["state"] == "authenticated" else 2


def wait_for_drawer(page: Page) -> Locator:
    create_button = page.get_by_role("button", name="Create a campaign")
    create_button.wait_for(state="visible", timeout=60_000)
    create_button.click()

    color_selector = page.locator(COLOR_SELECTOR)
    color_selector.wait_for(state="visible", timeout=60_000)
    drawer = color_selector.locator('xpath=ancestor::*[@role="dialog"][1]')
    drawer.wait_for(state="visible", timeout=30_000)
    deadline = time.time() + 30
    while time.time() < deadline:
        box = drawer.bounding_box()
        viewport = page.viewport_size
        if (
            box
            and viewport
            and box["x"] + box["width"] <= viewport["width"] + 1
        ):
            break
        page.wait_for_timeout(100)
    else:
        raise RuntimeError("Campaign drawer did not finish opening.")
    return drawer


def dismiss_onboarding_if_visible(page: Page) -> bool:
    dismiss = page.get_by_role("button", name="Dismiss").first
    try:
        if dismiss.is_visible(timeout=1_000):
            dismiss.click()
            dismiss.wait_for(state="hidden", timeout=10_000)
            return True
    except PlaywrightTimeoutError:
        pass
    return False


def collect_geometry(drawer: Locator) -> dict[str, Any]:
    return drawer.evaluate(
        """
        (dialog) => {
          const rect = dialog.getBoundingClientRect();
          const controls = [...dialog.querySelectorAll(
            'button, input, textarea, [role="combobox"], [role="grid"]'
          )].map((element) => {
            const box = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              role: element.getAttribute('role') || '',
              name:
                element.getAttribute('aria-label') ||
                element.getAttribute('name') ||
                element.textContent?.trim() ||
                '',
              automationId: element.getAttribute('data-automation-id') || '',
              disabled: element.matches(':disabled'),
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height
            };
          });
          return {
            drawer: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            controls
          };
        }
        """
    )


def capture_state(
    context: BrowserContext,
    page: Page,
    *,
    label: str,
    asset_root: str | None,
    output_dir: Path,
) -> dict[str, Any]:
    context.clear_cookies(name="srr")
    if asset_root:
        context.add_cookies(
            [
                {
                    "name": "srr",
                    "value": asset_root,
                    "domain": "microsoft.sharepoint-df.com",
                    "path": "/",
                    "secure": True,
                    "sameSite": "None",
                }
            ]
        )

    try:
        page.goto(
            campaign_url(),
            wait_until="domcontentloaded",
            timeout=120_000,
        )
    except PlaywrightError as error:
        if "net::ERR_ABORTED" not in str(error):
            raise
    page.wait_for_selector(AUTHENTICATED_SELECTOR, timeout=60_000)
    dismiss_onboarding_if_visible(page)
    drawer = wait_for_drawer(page)
    if dismiss_onboarding_if_visible(page):
        drawer.wait_for(state="visible", timeout=30_000)
        page.wait_for_timeout(500)
    page.screenshot(path=output_dir / f"{label}-full.png", full_page=False)
    drawer.screenshot(path=output_dir / f"{label}-drawer.png")
    geometry = collect_geometry(drawer)
    cancel = drawer.get_by_role("button", name="Cancel")
    if cancel.count():
        cancel.click()
    else:
        drawer.get_by_role("button", name="Close").click()
    return geometry


def capture_campaign(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        context = launch_context(playwright, headed=args.headed)
        try:
            page = first_page(context)
            before = capture_state(
                context,
                page,
                label="before-target-flight1535-on",
                asset_root=None,
                output_dir=output_dir,
            )
            after = capture_state(
                context,
                page,
                label="after-pr-flight1535-on",
                asset_root=args.pr_asset_root,
                output_dir=output_dir,
            )
        finally:
            context.clear_cookies(name="srr")
            context.close()

    metrics = {
        "before": {
            "source": "target/current deployed",
            "flight1535": "ON",
            **before,
        },
        "after": {
            "source": args.pr_asset_root,
            "flight1535": "ON",
            **after,
        },
        "geometryIdentical": before == after,
    }
    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2),
        encoding="utf-8",
    )
    emit(
        {
            "action": "capture-campaign",
            "state": "completed",
            "outputDir": str(output_dir),
            "geometryIdentical": metrics["geometryIdentical"],
        }
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="action", required=True)

    bootstrap_parser = subparsers.add_parser("bootstrap")
    bootstrap_parser.add_argument("--timeout-minutes", type=int, default=30)
    bootstrap_parser.set_defaults(handler=bootstrap)

    check_parser = subparsers.add_parser("check")
    check_parser.set_defaults(handler=check_authentication)

    capture_parser = subparsers.add_parser("capture-campaign")
    capture_parser.add_argument("--pr-asset-root", required=True)
    capture_parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
    )
    capture_parser.add_argument("--headed", action="store_true")
    capture_parser.set_defaults(handler=capture_campaign)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
