"""설치된 Claude Code 바이너리에서 내장 you-should-know mod를 꺼내 한국어 응답으로 패치한다.

usage: python3 build.py [claude 바이너리 경로]
출력: hooks/register.ts (Claude Code를 업데이트한 뒤 다시 돌려 갱신한다)
"""
import re, sys, shutil, pathlib, subprocess, tempfile

HERE = pathlib.Path(__file__).resolve().parent
NAME = "you-should-know"
MARKER = b"Here is a note offered by a side agent"


def extract(binary):
    """Bun 단일 바이너리에서 mod 모듈(chunk)의 JS 소스를 잘라낸다."""
    b = binary.read_bytes()
    for m in re.finditer(re.escape(MARKER), b):
        s = b.rfind(b"// @bun @bytecode", 0, m.start())
        e = b.find(b"// @bun @bytecode", m.start())
        chunk = b[s:e]
        chunk = chunk[: chunk.find(b"\x00")] if b"\x00" in chunk else chunk
        if b"cc-plugin-you-should-know" in chunk and b"// Version:" in chunk[:1000]:
            return chunk.decode()
    sys.exit("mod 소스를 찾지 못했다: Claude Code 버전에서 구조가 바뀌었을 수 있다")


binary = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else shutil.which("claude")).resolve()
raw = extract(binary)
version = re.search(r"// Version: (\S+)", raw).group(1)
with tempfile.NamedTemporaryFile("w", suffix=".js") as f:
    f.write(raw)
    f.flush()
    pretty = subprocess.run(["npx", "-y", "prettier@3", "--parser", "babel", f.name],
                            check=True, capture_output=True, text=True).stdout
out_path = HERE / "hooks" / "register.ts"
lines = pretty.split("\n")

def find(prefix):
    return next(i for i, l in enumerate(lines) if l.startswith(prefix))

# registerPlugin 블록(내부 gate/등록 API 사용)과 원래 export 블록 제거
body = lines[:find("var Tn = !1;")]
# 내부 chunk import 제거 (named import 5개 + side-effect import)
body = [l for l in body if not l.startswith("import ")]
src = "\n".join(body)

# ns: 내장용 scan manifest (v()로 감싼 CJS 블록) 제거
s = src.index("var ns = v(function")
e = src.index("});\n", s) + 4
src = src[:s] + src[e:]

src = src.replace('"cc-plugin-you-should-know"', f'"{NAME}"')
# $.state 참조는 리터럴이어야 validate 통과
src = src.replace("{ ...At, id: t }", f'{{ plugin: "{NAME}", key: "aboutOpen", id: t }}')
assert "...At" not in src
REF = f'{{ plugin: "{NAME}", key: "aboutOpen", id: t }}'
for a, b in [("e.state.get(r)", f"e.state.get({REF})"), ("e.state.set(r, i,", f"e.state.set({REF}, i,")]:
    assert src.count(a) == 1, a
    src = src.replace(a, b)
src = src.replace("`/plugin disable ${Tae}@builtin`", "`/plugin disable ${Tae}`")
# 원본 telemetry 전송 차단
src, n = re.subn(r"\b\w+\.telemetry\.(log|mark)\(", "(() => {})(", src)
assert n >= 3, n

LANG = (
    "\n\n## Language\n\n"
    "Write everything the human reads in Korean (한국어): the text after learn:, "
    "the bold title and the body after explain:. Wherever these instructions say "
    "\"plain English\", read it as plain, easy-to-read Korean. Keep the labels "
    "learn:, tag: and explain: and the tag value (You should know or Heads up) "
    "exactly as written in English, and keep code, commands and file names as they are."
)
# dn: 배열 join 결과 끝에 추가 / mn: 마지막 지시문 앞에 추가
assert src.count("var dn = (e, t) =>\n  [") == 1
src = re.sub(r"(var dn = \(e, t\) =>\n  \[[\s\S]*?\n  \]\.join\([^)]*\))",
             lambda m: m.group(1) + " + " + repr(LANG), src, count=1)
assert repr(LANG) in src, "dn patch failed"
before = src.count("Output only the explanation.`")
assert before == 1, before
src = src.replace("Output only the explanation.`",
                  "Output only the explanation." + LANG.replace("`", "") + "`")

helpers = f'''// Derived from Claude Code {version} built-in mod cc-plugin-you-should-know
// Original (c) Anthropic PBC. All rights reserved. Patched to answer in Korean.
// @ts-nocheck
const Tae = "{NAME}";
const k0n = "";
const po = (target, all) => {{
  for (const name in all) Object.defineProperty(target, name, {{ get: all[name], enumerable: true }});
}};
'''
pathlib.Path(out_path).write_text(helpers + src + "\nexport { os as register, dn as proposePrompt, mn as explainPrompt };\n")
print(f"ok: Claude Code {version} -> {out_path}")
