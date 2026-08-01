// 마지막 화면.
//
// 이 게임은 여기까지 오는 내내 아무것도 가르치지 않았다.
// 마지막에 와서 가르치면 그게 다 무너진다.
// 그래서 여기서도 **설명하지 않는다.** 무슨 일이 있었는지만 늘어놓는다.
//
// 숫자를 나란히 두는 것만으로 충분하다:
//   게임 안에서 모은 점수 / 게임 밖에서 얻은 점수 하나.
// 그 대비가 이 게임이 하려던 말이고, 그건 말이 아니라 표로 전해진다.

const CSS = `
#fin{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:#0a0908;font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;color:#e8dcc0;
  opacity:0;transition:opacity 1.2s ease}
#fin.on{opacity:1}
#fin .box{width:min(500px,92vw);padding:36px 32px}
#fin h2{margin:0 0 26px;font-size:11px;font-weight:500;letter-spacing:.22em;color:#7d6f5c}
#fin .ledger{display:grid;grid-template-columns:1fr auto;gap:10px 20px;
  font-size:14px;line-height:1.7;align-items:baseline}
#fin .ledger dt{color:#7d6f5c;margin:0}
#fin .ledger dd{margin:0;font-family:ui-monospace,Consolas,monospace;
  font-variant-numeric:tabular-nums;text-align:right;color:#c9bda4}
#fin .ledger .big dt{color:#e8dcc0}
#fin .ledger .big dd{color:#ffd447;font-size:19px}
#fin hr{border:0;border-top:1px solid #2a251f;margin:20px 0}
#fin .said{margin-top:26px;padding:16px 18px;background:#14110f;border-left:2px solid #3b342e;
  font-size:13.5px;line-height:1.8;color:#c9bda4}
#fin .said b{color:#e8dcc0;font-weight:500}
#fin .row{margin-top:30px;display:flex;gap:10px;flex-wrap:wrap}
#fin button{padding:9px 16px;font:inherit;font-size:12px;color:#7d6f5c;
  background:transparent;border:1px solid #3b342e;cursor:pointer}
#fin button:hover{color:#e8dcc0;border-color:#5a4f42}
`;

export class Ending {
  /** @param {() => void} onRestart 처음부터 다시 */
  constructor(onRestart) {
    this.onRestart = onRestart;
  }

  /**
   * @param {object} d
   * @param {number} d.days      며칠을 살았나
   * @param {number} d.inGame    게임 안에서 모은 점수
   * @param {number} d.real      현실에서 얻은 점수 (100 또는 0)
   * @param {string} [d.saw]     인증 사진에서 본 것 한 줄
   * @param {string} [d.told]    이 사람이 직접 친 문장 중 하나 (자기 얘기)
   * @param {string} [d.toWhom]  그 말을 누구에게 했나
   */
  show(d) {
    const style = document.createElement('style');
    style.textContent = CSS;

    const root = document.createElement('div');
    root.id = 'fin';
    root.innerHTML = `
      <div class="box">
        <h2>${d.days}일</h2>
        <dl class="ledger">
          <dt>게임 안에서 한 일</dt><dd>${d.inGame}</dd>
          <dt>붕괴 이후</dt><dd>0</dd>
        </dl>
        <hr>
        <dl class="ledger">
          <div class="big" style="display:contents">
            <dt>${d.saw ? '실제로 한 일' : '실제로 한 일 — 아직'}</dt><dd>${d.real}</dd>
          </div>
        </dl>
        ${d.saw ? `<div class="said">${escape(d.saw)}</div>` : ''}
        ${d.told ? `<div class="said">${d.toWhom ? `<b>${escape(d.toWhom)}</b>에게 한 말<br>` : ''}${escape(d.told)}</div>` : ''}
        <div class="row">
          <button data-act="close">돌아가기</button>
          <button data-act="restart">처음부터</button>
        </div>
      </div>`;

    document.body.append(style, root);
    this.root = root;
    this.style = style;
    requestAnimationFrame(() => root.classList.add('on'));   // 천천히 떠오른다

    root.querySelector('[data-act=close]').onclick = () => this.close();
    root.querySelector('[data-act=restart]').onclick = () => { this.close(); this.onRestart?.(); };
  }

  close() {
    this.root?.remove();
    this.style?.remove();
    this.root = this.style = null;
  }
}

/** 플레이어가 직접 친 문장이 그대로 들어온다. 태그로 읽히지 않게 막는다. */
function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
