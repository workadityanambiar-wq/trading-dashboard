import markdown
import pathlib

base = pathlib.Path(__file__).parent
md_text = (base / "GUIDE.md").read_text(encoding="utf-8")
body = markdown.markdown(md_text, extensions=["tables", "fenced_code", "toc"])

html = (
    """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Quant Dashboard Guide</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a2e;
    max-width: 920px;
    margin: 0 auto;
    padding: 36px 44px;
  }
  h1 { font-size: 26px; color: #0f0f1a; margin: 0 0 8px;
       border-bottom: 3px solid #6366f1; padding-bottom: 10px; }
  h2 { font-size: 17px; color: #1a1a3e; margin: 30px 0 10px;
       border-bottom: 1.5px solid #e0e0f0; padding-bottom: 6px; }
  h3 { font-size: 14px; color: #2a2a4e; margin: 18px 0 7px; }
  h4 { font-size: 13px; color: #3a3a5e; margin: 12px 0 5px; }
  p  { margin: 0 0 10px; }
  ul, ol { margin: 6px 0 10px 22px; }
  li { margin: 3px 0; }
  a  { color: #6366f1; text-decoration: none; }
  code {
    font-family: "Cascadia Code", "Fira Code", Consolas, monospace;
    font-size: 11.5px;
    background: #f0f0fa;
    border: 1px solid #ddddf0;
    border-radius: 3px;
    padding: 1px 5px;
  }
  pre {
    background: #1a1a2e;
    color: #e8e8f8;
    border-radius: 6px;
    padding: 14px 16px;
    margin: 10px 0 14px;
    overflow-x: auto;
    font-size: 11px;
    line-height: 1.6;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    color: inherit;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 12px;
  }
  th {
    background: #6366f1;
    color: white;
    padding: 7px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 6px 12px;
    border-bottom: 1px solid #e8e8f0;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8f8ff; }
  hr { border: none; border-top: 1px solid #e0e0f0; margin: 24px 0; }
  @media print {
    body { padding: 20px 28px; font-size: 12px; }
    pre  { page-break-inside: avoid; }
    h2   { page-break-after: avoid; }
    table { page-break-inside: avoid; }
  }
</style>
</head>
<body>
"""
    + body
    + "\n</body>\n</html>"
)

html_path = base / "GUIDE.html"
html_path.write_text(html, encoding="utf-8")
print(f"HTML written: {html_path}")
