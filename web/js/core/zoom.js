// 指で広げる拡大を止める。viewport の user-scalable=no は iOS Safari が無視するので、ピンチの操作そのものを打ち消す
// gesturestart：iOS Safari のピンチ。touchmove（2本指以上）：そのほかのブラウザのピンチ
export function blockPinchZoom(doc = document) {
  const stop = (e) => e.preventDefault()
  doc.addEventListener('gesturestart', stop, { passive: false })
  doc.addEventListener('touchmove', (e) => { if (e.touches?.length > 1) e.preventDefault() }, { passive: false })
}
