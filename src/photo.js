// Act 0: 실제 방 사진 → 프록시 → 도트맵.
// 사진은 브라우저와 서버 어디에도 저장하지 않는다. 리사이즈 → 전송 → 파기.

const MAX_EDGE = 1568;   // 긴 변 기준. 방 인식에 충분하고 이미지 토큰이 과하지 않다.

/** 파일을 긴 변 MAX_EDGE 이하 JPEG base64로 줄인다. 원본은 업로드하지 않는다. */
async function toBase64(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  canvas.width = canvas.height = 0;                       // 캔버스 픽셀 즉시 폐기
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg', w, h };
}

/**
 * DEV 패널에 사진 입력을 붙인다. 키가 없으면 그 사실을 알리고 버튼을 비활성화한다.
 * @param {Phaser.Scene} scene RoomScene
 */
export async function mountPhotoInput(scene) {
  const slot = document.getElementById('photo');
  if (!slot) return;

  let health = { key: false };
  try {
    health = await fetch('/api/health').then((r) => r.json());
  } catch { /* 서버가 정적 파일만 서빙 중일 수 있다 */ }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.disabled = !health.key;

  const status = document.createElement('span');
  status.className = 'note';
  status.textContent = health.key
    ? `준비됨 (${health.model})`
    : 'API 키 없음 — .env에 ANTHROPIC_API_KEY를 넣고 서버 재시작';

  slot.replaceChildren(input, status);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    status.textContent = '읽는 중…';
    input.disabled = true;
    try {
      const img = await toBase64(file);
      const res = await fetch('/api/room-vision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: img.data, mediaType: img.mediaType }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);

      scene.loadVision(out.vision, '내 방 (사진)');
      status.textContent = `완료 · ${img.w}×${img.h} · 객체 ${out.vision.objects?.length ?? 0}개 · ${out.usage.input}→${out.usage.output} tokens`;
    } catch (e) {
      // 실패해도 게임은 막지 않는다 — 기본 레이아웃으로 계속 (room-vision.md 리스크 표)
      status.textContent = `실패: ${e.message} — 목 데이터로 계속`;
    } finally {
      input.disabled = false;
      input.value = '';
    }
  });
}
