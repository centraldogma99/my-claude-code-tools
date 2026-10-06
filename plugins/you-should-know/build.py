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

# 화면 문구 한글화: (원문 조각, 바꿀 조각, 원문 등장 횟수). 원문의 ’ 등은 소스에 escape 그대로 있다.
UI = [
    ('label: e.isOpen ? "Return to topic" : "What is this"', 'label: e.isOpen ? "주제로 돌아가기" : "이게 뭔가요"', 1),
    ('{ text: "Learn more", look: "bold" }', '{ text: "자세히 보기", look: "bold" }', 1),
    ('" to get a deeper explanation and chat about it."', '"를 누르면 더 깊은 설명을 보고 이어서 물어볼 수 있어요."', 1),
    ('"Disable on this machine with "', '"이 컴퓨터에서 끄려면 "', 1),
    ('{ text: "." },', '{ text: "을 실행하세요." },', 1),
    ('"A side agent is watching your back while Claude works."', '"Claude가 일하는 동안 사이드 에이전트가 함께 지켜보고 있어요."', 1),
    ('"When something comes up that you should know but might miss, this plugin flags it for you."',
     '"알아야 하는데 놓치기 쉬운 일이 생기면 이 플러그인이 알려 드려요."', 1),
    ('"Dismissed."', '"닫았어요."', 2),
    ('label: "Turn off suggestions"', 'label: "제안 끄기"', 1),
    ('label: "That was helpful"', 'label: "도움이 됐어요"', 2),
    ('label: "Not relevant"', 'label: "관련 없어요"', 1),
    ('label: "Couldn\\u2019t understand"', 'label: "이해하지 못했어요"', 1),
    ('label: "Didn\\u2019t understand"', 'label: "이해가 안 돼요"', 1),
    ('label: "Understood"', 'label: "이해했어요"', 1),
    ('label: "Chat in main session"', 'label: "메인 세션에서 이어 묻기"', 1),
    ('label: "Dismiss"', 'label: "닫기"', 2),
    ('label: "OK"', 'label: "확인"', 1),
    ('"One moment\\u2026"', '"잠시만요\\u2026"', 1),
    ('"Couldn\\u2019t publish that page"', '"페이지를 게시하지 못했어요"', 1),
    ('"Not published (blocked by a permission setting)"', '"게시하지 않았어요 (권한 설정에서 막힘)"', 1),
    ('"Couldn\\u2019t write that explanation"', '"설명을 쓰지 못했어요"', 1),
    ('"Couldn\\u2019t turn suggestions off here. Use /plugin."', '"여기서는 제안을 끌 수 없어요. /plugin을 쓰세요."', 1),
    ('"Couldn\\u2019t write that page"', '"페이지를 쓰지 못했어요"', 1),
    ('"Making your page (a minute or two) \\xB7 Claude keeps working\\u2026"',
     '"페이지를 만드는 중이에요 (1~2분) \\xB7 Claude는 하던 작업을 계속해요\\u2026"', 1),
    ('label: t ? "Press again to disable" : "Disable"', 'label: t ? "한 번 더 누르면 꺼져요" : "끄기"', 1),
    ('label: "Learn more"', 'label: "자세히 보기"', 1),
    ('label: "Knew this already"', 'label: "이미 알아요"', 1),
    ('"Learning page ready"', '"학습 페이지가 준비됐어요"', 1),
    ('label: "Helpful"', 'label: "도움 됐어요"', 1),
    ('label: "Not helpful"', 'label: "도움 안 됐어요"', 1),
    ('label: "Didn\\u2019t read"', 'label: "안 읽었어요"', 1),
    ('"Your prompt box has text in it. Send or clear it, then press again to turn suggestions off."',
     '"프롬프트 입력창에 글이 있어요. 보내거나 지운 뒤 다시 누르면 제안이 꺼져요."', 1),
    ('"A dialog has the keyboard. Answer it, then press 2 again."', '"대화상자가 키 입력을 받고 있어요. 먼저 답한 뒤 2를 다시 누르세요."', 1),
    ('"Your prompt box has text in it. Send or clear it, then press 2 again."',
     '"프롬프트 입력창에 글이 있어요. 보내거나 지운 뒤 2를 다시 누르세요."', 1),
    ('"The prompt box didn\'t take the note. Press 2 to try again."', '"입력창에 메모를 넣지 못했어요. 2를 눌러 다시 시도하세요."', 1),
    # 태그는 저장값·파서에서 영어로 쓰이므로 화면에 그릴 때만 바꾼다
    ('h(o, { ...r.tag }, " ", t, " \\xB7 ")', 'h(o, { ...r.tag }, " ", koTag(t), " \\xB7 ")', 1),
    ('h(r, { ...n.tag }, t, " \\xB7 ")', 'h(r, { ...n.tag }, koTag(t), " \\xB7 ")', 1),
    ('var Yo = (e) => `${e} \\xB7 `;', 'var Yo = (e) => `${koTag(e)} \\xB7 `;', 1),
]
for old, new, count in UI:
    assert src.count(old) == count, (old, src.count(old))
    src = src.replace(old, new)

# (원문 조각, 바꿀 조각, 원문 등장 횟수) — UI 한글화 뒤 소스에 적용
FLOW = [
    # '관련 없어요' 선택지 제거, '제안 끄기'를 3번으로 당김
    ('        ? [{ hotkey: "4", label: "제안 끄기", onPress: o }]',
     '        ? [{ hotkey: "3", label: "제안 끄기", onPress: o }]', 1),
    ('    { hotkey: "2", label: "관련 없어요", onPress: t.notRelevant },\n    {\n      hotkey: "3",\n      label: "이해하지 못했어요",',
     '    {\n      hotkey: "2",\n      label: "이해하지 못했어요",', 1),
    ('                notRelevant: W("not_relevant"),\n', '', 1),
    # 설명을 닫을 때 본문을 asked 상태에 넘겨, '이해 안 돼요'가 더 쉬운 말로 다시 쓰게 한다
    ('dismiss: I("dismiss", () => ht({ line: m, iteration: b })),',
     'dismiss: I("dismiss", () => ht({ line: m, iteration: b, text: p.text })),', 1),
    ('notUnderstood: W("explained_not_understood"),',
     'notUnderstood: W("explained_not_understood", () =>\n'
     '                  p.text === void 0\n'
     '                    ? ge(p.line, void 0, 1)\n'
     '                    : ge(p.line, { direction: "simpler_words", previous: p.text }, X + 1),\n'
     '                ),', 1),
    # 한 줄 제안만 보고 이해 못 했으면 설명을 바로 띄운다
    ('notUnderstood: W("not_understood"),',
     'notUnderstood: W("not_understood", () => ge(p.line, void 0, 1)),', 1),
]
for old, new, count in FLOW:
    assert src.count(old) == count, (old, src.count(old))
    src = src.replace(old, new)

helpers = f'''// Derived from Claude Code {version} built-in mod cc-plugin-you-should-know
// Original (c) Anthropic PBC. All rights reserved. Patched to answer in Korean.
// @ts-nocheck
const Tae = "{NAME}";
const k0n = "";
const koTag = (t) => ({{ "You should know": "알아 두세요", "Heads up": "주의" }})[t] ?? t;
const po = (target, all) => {{
  for (const name in all) Object.defineProperty(target, name, {{ get: all[name], enumerable: true }});
}};
'''
pathlib.Path(out_path).write_text(helpers + src + "\nexport { os as register, dn as proposePrompt, mn as explainPrompt };\n")
print(f"ok: Claude Code {version} -> {out_path}")
