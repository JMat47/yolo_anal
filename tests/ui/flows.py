"""Page steps shared by the in-browser tests. Waits are written as functions: the page's CSP has no unsafe-eval."""


def open_ready(page, app):
    page.goto(app.url)
    page.wait_for_function("() => document.querySelector('.model')?.dataset.health === 'ready'", timeout=15000)


def scan_upload(page, path) -> dict:
    """Uploads a photo, returns the scan payload once the reveal has finished."""
    with page.expect_response("**/api/scan", timeout=20000) as response:
        page.set_input_files("#upload-input", str(path))
    payload = response.value.json()
    page.wait_for_selector('[data-box="01"]', state="attached", timeout=10000)
    wait_settled(page)
    return payload


def wait_settled(page):
    page.wait_for_function("() => document.getAnimations().every(a => a.playState !== 'running')", timeout=10000)


def mark_gap(page, start, end) -> float:
    return page.evaluate(f"""() => performance.getEntriesByName('{end}').at(-1).startTime
                                   - performance.getEntriesByName('{start}').at(-1).startTime""")


def text_of(page, selector) -> str:
    """textContent with whitespace collapsed, the way R8 reads tags and cards."""
    return page.evaluate("(s) => document.querySelector(s).textContent.replace(/\\s+/g, ' ').trim()", selector)
