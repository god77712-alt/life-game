// Act 0 — **당신의 방이 이 게임의 무대가 된다.**
//
// 이 게임에서 가장 먼저 오는 약속이고, 여태 DEV 패널 안에 숨어 있었다.
// 설문 다음에 이게 나와야 Act 0이 완성된다.
//
// 사진은 어디에도 저장하지 않는다 — 브라우저가 줄여서 보내고,
// 서버는 함수 스코프 안에서만 들고 Claude에 넘긴 뒤 버린다.
// 그 약속을 화면에도 적는다. 말로 안 하면 아무도 믿을 이유가 없다.
//
// **건너뛸 수 있어야 한다.** 카메라가 없을 수도, 방을 보여주기 싫을 수도,
// 심사위원이 그냥 게임만 보고 싶을 수도 있다. 그때는 준비된 방으로 시작한다.

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
  canvas.width = canvas.height = 0;         // 캔버스 픽셀 즉시 폐기
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

const CSS = `
#act0{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;
  background:#0d0b0a;font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;color:#e8dcc0}
#act0 .box{width:min(520px,92vw);padding:34px 30px}
#act0 h2{margin:0 0 8px;font-size:11px;font-weight:500;letter-spacing:.22em;color:#7d6f5c}
#act0 h1{margin:0 0 22px;font-size:19px;font-weight:600;letter-spacing:-.01em;line-height:1.5}
#act0 p{margin:0 0 12px;font-size:13px;line-height:1.85;color:#c9bda4}
#act0 .quiet{color:#7d6f5c;font-size:11px;line-height:1.75;margin-top:20px}
#act0 .row{margin-top:26px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#act0 button{padding:9px 16px;font:inherit;font-size:12px;color:#14110f;background:#ffd447;
  border:0;cursor:pointer}
#act0 button.ghost{background:transparent;color:#7d6f5c;border:1px solid #3b342e}
#act0 button:disabled{opacity:.4;cursor:default}
#act0 .said{margin-top:22px;padding:14px 16px;background:#14110f;border-left:2px solid #ffd447;
  font-size:13px;line-height:1.7;min-height:1em}
#act0 input[type=file]{display:none}
`;

export class RoomPhoto {
  /**
   * @param {(vision: object) => void} onVision 인식 성공 — 이 방으로 게임을 시작한다
   * @param {() => void} onSkip 준비된 방으로 시작한다
   */
  constructor(onVision, onSkip) {
    this.onVision = onVision;
    this.onSkip = onSkip;
  }

  async show() {
    const style = document.createElement('style');
    style.textContent = CSS;

    const root = document.createElement('div');
    root.id = 'act0';
    root.innerHTML = `
      <div class="box">
        <h2>ACT 0</h2>
        <h1>당신의 방을 한 장 찍어주세요.</h1>
        <p>그 방이 이 게임의 무대가 됩니다.</p>
        <p>정면으로, 대충 찍어도 됩니다. 어질러져 있어도 상관없습니다.</p>
        <div class="row">
          <button data-act="pick">사진 고르기</button>
          <button class="ghost" data-act="skip">준비된 방으로 시작</button>
        </div>
        <p class="quiet">
          사진은 <strong>저장하지 않습니다.</strong> 무엇이 있는지 읽는 데만 쓰고 바로 버립니다.<br>
          서버에 파일로 남기지 않고, 기록에도 남기지 않습니다.
        </p>
        <div class="said"></div>
        <input type="file" accept="image/*">
      </div>`;

    document.body.append(style, root);
    this.root = root;
    this.style = style;

    // 키가 없으면 애초에 시도할 수 없다. 조용히 알리고 넘어가게 한다
    let health = { key: false };
    try { health = await fetch('/api/health').then((r) => r.json()); } catch { /* 정적만 서빙 중 */ }
    if (!health.key) {
      root.querySelector('[data-act=pick]').disabled = true;
      root.querySelector('.said').textContent = '지금은 사진 인식을 쓸 수 없습니다. 준비된 방으로 시작해주세요.';
    }

    const input = root.querySelector('input');
    root.querySelector('[data-act=pick]').onclick = () => input.click();
    root.querySelector('[data-act=skip]').onclick = () => { this.close(); this.onSkip?.(); };
    input.onchange = () => this.send(input.files?.[0]);
  }

  async send(file) {
    if (!file) return;
    const said = this.root.querySelector('.said');
    const buttons = this.root.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    said.textContent = '방을 읽는 중…';

    try {
      const img = await shrink(file);
      const res = await fetch('/api/room-vision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: img.data, mediaType: img.mediaType }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);

      const n = out.vision.objects?.length ?? 0;
      said.textContent = `${n}개를 찾았습니다. 사진은 버렸습니다.`;
      // 읽은 결과를 한 박자 보여주고 넘어간다 — 무슨 일이 있었는지 알 시간
      setTimeout(() => { this.close(); this.onVision?.(out.vision); }, 900);
    } catch (e) {
      // 실패해도 게임을 막지 않는다 (room-vision.md 리스크 표)
      said.textContent = `읽지 못했습니다 — ${e.message}`;
      buttons.forEach((b) => { b.disabled = false; });
      this.root.querySelector('[data-act=pick]').textContent = '다시 고르기';
    }
  }

  close() {
    this.root?.remove();
    this.style?.remove();
    this.root = this.style = null;
  }
}
