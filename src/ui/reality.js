// Act 4 — 현실 전환. **게임이 마지막으로 하는 일.**
//
// 붕괴 다음 날, 게임 안의 모든 점수가 0이 된 뒤에 이 창이 뜬다.
// 여기서 요구하는 건 게임 속 행동이 아니라 **실제로 이불을 갠 사진**이다.
// 통과하면 +100 — 이 게임에서 점수가 붙는 마지막이자 유일한 행동.
//
// 사진은 어디에도 저장하지 않는다. 줄여서 보내고, 서버는 Claude에 넘긴 뒤 버린다.
//
// 왜 캔버스가 아니라 HTML인가 — 파일 선택과 카메라는 브라우저 UI가 필요하고,
// 한국어 안내문은 비트맵 폰트보다 시스템 폰트가 읽기 낫다. 이 한 장면만 예외다.

const MAX_EDGE = 1568;

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  canvas.width = canvas.height = 0;          // 캔버스 픽셀 즉시 폐기
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

const CSS = `
#reality{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:rgba(8,8,10,.94);font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;color:#e8dcc0}
#reality .box{width:min(520px,92vw);padding:32px 28px;background:#14110f;
  border:1px solid #5a4f42;box-shadow:0 0 0 1px #0a0806}
#reality h2{margin:0 0 20px;font-size:15px;font-weight:600;color:#ffd447;letter-spacing:.02em}
#reality p{margin:0 0 12px;font-size:13px;line-height:1.85;color:#c9bda4}
#reality .quiet{color:#7d6f5c;font-size:11px;line-height:1.7}
#reality .row{margin-top:22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#reality button{padding:9px 16px;font:inherit;font-size:12px;color:#14110f;background:#ffd447;
  border:0;cursor:pointer}
#reality button.ghost{background:transparent;color:#7d6f5c;border:1px solid #3b342e}
#reality button:disabled{opacity:.4;cursor:default}
#reality .said{margin-top:20px;padding:14px 16px;background:#0f0d0b;border-left:2px solid #ffd447;
  font-size:13px;line-height:1.7;color:#e8dcc0}
#reality .score{margin-top:18px;font-size:26px;color:#ffd447;letter-spacing:.04em}
#reality input[type=file]{display:none}
`;

export class Reality {
  /** @param {(score:number, verdict:object)=>void} onPass 통과했을 때 (점수는 여기서만 준다) */
  constructor(onPass) {
    this.onPass = onPass;
    this.open = false;
  }

  show(claim = '이불 개기') {
    if (this.open) return;
    this.open = true;
    this.claim = claim;

    const style = document.createElement('style');
    style.textContent = CSS;

    const root = document.createElement('div');
    root.id = 'reality';
    root.innerHTML = `
      <div class="box">
        <h2>${claim}</h2>
        <p>게임 안에서 하는 일은 이제 점수가 되지 않는다.</p>
        <p>실제로 한 번 해보고, 그걸 찍어서 올리면 된다.</p>
        <div class="row">
          <button data-act="pick">사진 고르기</button>
          <button class="ghost" data-act="skip">나중에</button>
        </div>
        <p class="quiet" style="margin-top:18px">
          사진은 저장하지 않는다. 확인하는 데만 쓰고 바로 버린다.<br>
          통과가 아니어도 점수가 깎이지 않는다. 다시 찍으면 된다.
        </p>
        <input type="file" accept="image/*" capture="environment">
      </div>`;

    document.body.append(style, root);
    this.root = root;
    this.style = style;

    const input = root.querySelector('input');
    root.querySelector('[data-act=pick]').onclick = () => input.click();
    root.querySelector('[data-act=skip]').onclick = () => this.close();
    input.onchange = () => this.send(input.files?.[0]);
  }

  async send(file) {
    if (!file) return;
    const box = this.root.querySelector('.box');
    const row = this.root.querySelector('.row');
    row.querySelectorAll('button').forEach((b) => { b.disabled = true; });

    let said = box.querySelector('.said');
    if (!said) { said = document.createElement('div'); said.className = 'said'; box.append(said); }
    said.textContent = '보는 중…';

    try {
      const img = await shrink(file);
      const res = await fetch('/api/reality', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...img, claim: this.claim }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);

      said.textContent = out.verdict.saw || '';
      if (!out.verdict.passed) {
        // 실패는 처벌이 아니다. 왜 아닌지만 말하고 다시 열어준다
        const why = {
          different: '이불이 안 보인다.',
          undone: '아직 그대로다.',
          unclear: '너무 어두워서 잘 안 보인다.',
        }[out.verdict.reason] ?? '';
        said.textContent = `${said.textContent}\n${why}`.trim();
        said.style.whiteSpace = 'pre-line';
        row.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        this.root.querySelector('[data-act=pick]').textContent = '다시 찍기';
        return;
      }

      // 통과. 게임 전체에서 점수가 붙는 마지막 행동이다
      row.remove();
      const score = document.createElement('div');
      score.className = 'score';
      score.textContent = '+100';
      box.append(score);

      const end = document.createElement('div');
      end.className = 'row';
      end.innerHTML = '<button data-act="done">닫기</button>';
      box.append(end);
      end.querySelector('button').onclick = () => this.close();

      this.onPass?.(100, out.verdict);
    } catch (e) {
      said.textContent = `확인하지 못했다 — ${e.message}`;
      row.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  }

  close() {
    this.root?.remove();
    this.style?.remove();
    this.root = this.style = null;
    this.open = false;
  }
}
