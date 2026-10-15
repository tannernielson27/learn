"""Builds the .docx and .pdf documents of the AI import golden corpus (#339).

Every word below is fictional, written for LeaRN's tests. There are no real patients, and
nothing here comes from an instructor's own documents (ADR 0008).

    py test/ai-import/corpus/build.py

Needs Python 3.12 and Pillow (only for the scanned page). The outputs are committed, so CI
needs neither. The .docx is stored uncompressed and the PDFs' text is not compressed, so a
test can check each file carries the fictional-content notice.
"""

from __future__ import annotations

import io
import random
import textwrap
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
NOTICE = "Fictional content written for the LeaRN test corpus (#339). No real patients."

# ---------------------------------------------------------------------------
# .docx: a minimal WordprocessingML package
# ---------------------------------------------------------------------------

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def run(text: str, *, bold=False, underline=False, highlight=False) -> str:
    props = ""
    if bold:
        props += "<w:b/>"
    if underline:
        props += '<w:u w:val="single"/>'
    if highlight:
        props += '<w:highlight w:val="yellow"/>'
    rpr = f"<w:rPr>{props}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def para(*runs: str | tuple) -> str:
    """A paragraph of runs; a plain string is an unformatted run."""
    body = "".join(r if r.startswith("<w:r>") else run(r) for r in runs)
    return f"<w:p>{body}</w:p>"


def bold(text: str) -> str:
    return para(run(text, bold=True))


def table(rows: list[list[list[str]]]) -> str:
    """Rows of cells; each cell is a list of paragraph strings (plain text or built runs)."""
    borders = "".join(
        f'<w:{side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
        for side in ("top", "left", "bottom", "right", "insideH", "insideV")
    )
    out = [f"<w:tbl><w:tblPr><w:tblBorders>{borders}</w:tblBorders></w:tblPr>"]
    for row in rows:
        out.append("<w:tr>")
        for cell in row:
            paras = "".join(p if p.startswith("<w:p>") else para(p) for p in cell) or para("")
            out.append(f"<w:tc>{paras}</w:tc>")
        out.append("</w:tr>")
    out.append("</w:tbl>")
    return "".join(out)


def write_docx(path: Path, body: list[str], title: str) -> None:
    document = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:document {W}><w:body>{''.join(body)}</w:body></w:document>"
    )
    parts = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            "</Relationships>"
        ),
        "docProps/core.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f"<dc:title>{escape(title)}</dc:title><dc:description>{escape(NOTICE)}</dc:description>"
            "</cp:coreProperties>"
        ),
        "word/document.xml": document,
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as archive:
        for name, text in parts.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            archive.writestr(info, text.encode("utf-8"))


def cardiac_quiz() -> None:
    star = "*"
    check = "✓"
    body = [
        bold("Cardiac Step-Down Unit Quiz"),
        para(NOTICE),
        bold("Question 1"),
        para(
            "The nurse is caring for a client who had a cardiac catheterization through the right "
            "femoral artery 4 hours ago. For each assessment finding, indicate whether it is "
            "expected or unexpected."
        ),
        table(
            [
                [["Assessment finding"], ["Expected"], ["Unexpected"]],
                [["Right pedal pulse 2+"], [star], []],
                [["Bruise 2 cm across at the insertion site"], [star], []],
                [["Right foot cool and pale"], [], [star]],
                [["New back pain with a blood pressure of 88/50 mm Hg"], [], [star]],
            ]
        ),
        bold("Question 2"),
        para(
            "The nurse is teaching a client about newly prescribed medications. For each "
            "medication, select the teaching points that apply. Each medication may have more "
            "than one teaching point."
        ),
        table(
            [
                [["Medication"], ["Check pulse before taking"], ["Report unusual bleeding"], ["Take with food"]],
                [["Digoxin"], [check], [], []],
                [["Warfarin"], [], [check], []],
                [["Metoprolol tartrate"], [check], [], [check]],
                [["Aspirin"], [], [check], [check]],
            ]
        ),
        bold("Question 3"),
        para(
            "The nurse reviews the morning note for a client with heart failure. Click to "
            "highlight the findings that require follow-up."
        ),
        para(
            "0700: Client is ",
            run("alert and oriented", underline=True),
            ". States they ",
            run("needed three pillows to sleep last night", underline=True, highlight=True),
            ". This morning's weight is ",
            run("up 2.1 kg since yesterday", underline=True, highlight=True),
            ". ",
            run("Fine crackles in both lung bases", underline=True, highlight=True),
            ". ",
            run("Apical heart rate 82/min and regular", underline=True),
            ". Client ",
            run("ate 75% of breakfast", underline=True),
            ".",
        ),
        para("Underlined phrases can be selected. Key: the highlighted phrases."),
        bold("Question 4"),
        para(
            "The nurse reviews the client's prescriptions. For each medication, choose the action "
            "the nurse should take."
        ),
        table(
            [
                [["Medication"], ["Nursing action"]],
                [
                    ["Digoxin 0.125 mg by mouth daily"],
                    [
                        "Hold if the apical pulse is below 60/min *",
                        "Give with an antacid",
                        "Give a double dose if one is missed",
                    ],
                ],
                [
                    ["Furosemide 40 mg IV daily"],
                    [
                        "Give at bedtime",
                        "Monitor the serum potassium level *",
                        "Restrict potassium-rich foods",
                    ],
                ],
                [
                    ["Lisinopril 10 mg by mouth daily"],
                    [
                        "Teach the client to report a persistent dry cough *",
                        "Give with a potassium supplement",
                        "Hold if the heart rate is above 100/min",
                    ],
                ],
            ]
        ),
        bold("Question 5"),
        para("Match each heart sound with what it most often means. Draw a line between them."),
        table(
            [
                [["Heart sound"], ["Usual meaning"]],
                [["S3"], ["Atrial contraction against a stiff ventricle"]],
                [["S4"], ["Fluid overload in heart failure"]],
                [["Pericardial friction rub"], ["Inflamed pericardium"]],
            ]
        ),
        bold("Instructor notes (not for students)"),
        para(
            "Question 2 tends to take the longest. Review warfarin and aspirin together "
            "afterward, and remind the class that the matching item is ungraded."
        ),
    ]
    write_docx(HERE / "02-cardiac-unit-quiz.docx", body, "Cardiac Step-Down Unit Quiz")


# ---------------------------------------------------------------------------
# .pdf: hand-written PDF 1.4 with uncompressed content streams
# ---------------------------------------------------------------------------


def pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_pdf(path: Path, pages: list[tuple[bytes, dict[str, bytes]]], title: str) -> None:
    """Each page is (content stream, {image name: XObject dictionary + stream})."""
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # filled in below
    pages_id = add(b"")
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    bold_font = add(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
    kids = []
    for content, images in pages:
        image_refs = {}
        for name, xobject in images.items():
            image_refs[name] = add(xobject)
        stream = add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        xobjects = " ".join(f"/{n} {i} 0 R" for n, i in image_refs.items())
        resources = f"<< /Font << /F1 {font} 0 R /F2 {bold_font} 0 R >>"
        resources += f" /XObject << {xobjects} >> >>" if xobjects else " >>"
        kids.append(
            add(
                (
                    f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] "
                    f"/Resources {resources} /Contents {stream} 0 R >>"
                ).encode()
            )
        )
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode()
    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    ).encode()
    info = add(f"<< /Title ({pdf_text(title)}) /Subject ({pdf_text(NOTICE)}) >>".encode())

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % number + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for offset in offsets:
        out.write(b"%010d 00000 n \n" % offset)
    out.write(
        b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objects) + 1, catalog, info, xref)
    )
    path.write_bytes(out.getvalue())


class Column:
    """Lays text out top to bottom in one column of a page."""

    def __init__(self, x: float, top: float, width_chars: int) -> None:
        self.x, self.y, self.width = x, top, width_chars
        self.ops: list[str] = []

    def line(self, text: str, *, size=10, bold=False, gap=13) -> None:
        font = "/F2" if bold else "/F1"
        self.ops.append(f"BT {font} {size} Tf {self.x:.1f} {self.y:.1f} Td ({pdf_text(text)}) Tj ET")
        self.y -= gap

    def para(self, text: str, *, indent="", bold=False) -> None:
        for i, piece in enumerate(textwrap.wrap(text, self.width - len(indent))):
            self.line((indent if i else "") + piece, bold=bold)
        self.y -= 4


def two_column_handout() -> None:
    header = Column(54, 740, 90)
    header.line("Respiratory Care Handout: Practice Questions", size=14, bold=True, gap=18)
    header.line(NOTICE, size=9, gap=26)
    left, right = Column(54, header.y, 46), Column(320, header.y, 46)

    left.para("1. A client with asthma uses an albuterol metered-dose inhaler. Which statement shows that the client understands how to use it?", bold=True)
    left.para('A. "I will breathe in quickly and deeply as I press the inhaler."', indent="   ")
    left.para('B. "I will hold my breath for about 10 seconds after each puff."', indent="   ")
    left.para('C. "I will take both puffs at the same time."', indent="   ")
    left.para('D. "I will rinse my mouth before I use the inhaler."', indent="   ")
    left.para("Answer: B")
    left.y -= 8
    left.para("2. The nurse is caring for a client with a chest tube connected to water-seal drainage. Which 2 findings should the nurse report to the provider?", bold=True)
    left.para("A. Continuous bubbling in the water-seal chamber *", indent="   ")
    left.para("B. Tidaling in the water-seal chamber with breathing", indent="   ")
    left.para("C. Drainage of 150 mL/h of bright red fluid *", indent="   ")
    left.para("D. A dry, intact occlusive dressing", indent="   ")
    left.para("E. Gentle bubbling in the suction control chamber", indent="   ")

    right.para("3. The nurse is suctioning a client's tracheostomy. Place the actions in the order the nurse should perform them.", bold=True)
    right.para("A. Insert the catheter without applying suction", indent="   ")
    right.para("B. Give the client 100% oxygen for 30 seconds", indent="   ")
    right.para("C. Apply intermittent suction while withdrawing the catheter", indent="   ")
    right.para("D. Perform hand hygiene and explain the procedure", indent="   ")
    right.para("Answer: D, B, A, C")
    right.y -= 8
    right.para("4. Calculate the client's body mass index. Height 170 cm, weight 85 kg. Round to one decimal place.", bold=True)
    right.para("Answer: 29.4")

    content = "\n".join(header.ops + left.ops + right.ops).encode("cp1252")
    write_pdf(HERE / "04-two-column-handout.pdf", [(content, {})], "Respiratory Care Handout")


SCANNED_LINES = [
    ("Pharmacology Quiz 3 (scanned copy)", True),
    (NOTICE, False),
    ("", False),
    ("1. A client is starting warfarin. Which food should the nurse teach", True),
    ("    the client to eat in consistent amounts?", True),
    ("    A. Bananas", False),
    ("    B. Spinach *", False),
    ("    C. Whole-grain bread", False),
    ("    D. Low-fat yogurt", False),
    ("", False),
    ("2. Which findings suggest that a client may have digoxin toxicity?", True),
    ("    Select all that apply.", True),
    ("    A. Nausea and loss of appetite *", False),
    ("    B. Seeing yellow-green halos around lights *", False),
    ("    C. Heart rate of 48/min *", False),
    ("    D. Increased urine output", False),
    ("    E. Ringing in the ears", False),
]


def scanned_quiz() -> None:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    width, height = 1275, 1650  # US letter at 150 dpi
    page = Image.new("L", (width, height), 246)
    draw = ImageDraw.Draw(page)

    def font(size: int, bold: bool):
        for name in (("arialbd.ttf" if bold else "arial.ttf"), "DejaVuSans.ttf"):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default(size=size)

    y = 140
    for text, is_bold in SCANNED_LINES:
        draw.text((130, y), text, fill=28, font=font(30 if is_bold else 28, is_bold))
        y += 50
    rng = random.Random(339)
    for _ in range(2500):  # toner speckle
        x, yy = rng.randrange(width), rng.randrange(height)
        draw.point((x, yy), fill=rng.randrange(90, 200))
    page = page.rotate(0.6, resample=Image.BICUBIC, fillcolor=236).filter(ImageFilter.GaussianBlur(0.6))
    jpeg = io.BytesIO()
    page.save(jpeg, "JPEG", quality=70)
    data = jpeg.getvalue()
    image = (
        b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
        b"/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n" % (width, height, len(data))
        + data
        + b"\nendstream"
    )
    content = b"q 612 0 0 792 0 0 cm /Im0 Do Q"
    write_pdf(HERE / "05-scanned-quiz.pdf", [(content, {"Im0": image})], "Pharmacology Quiz 3")


if __name__ == "__main__":
    cardiac_quiz()
    two_column_handout()
    scanned_quiz()
    print("Built 02-cardiac-unit-quiz.docx, 04-two-column-handout.pdf, 05-scanned-quiz.pdf")
