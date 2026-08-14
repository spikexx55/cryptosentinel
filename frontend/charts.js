window.drawPriceChart = function (canvas, candles, color = '#8c7dff') {
  const ratio = window.devicePixelRatio || 1; const width = canvas.clientWidth; const height = canvas.clientHeight;
  canvas.width = width * ratio; canvas.height = height * ratio; const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const prices = candles.map(c => c.close); const min = Math.min(...prices); const max = Math.max(...prices); const pad = 14;
  const point = (price, index) => [pad + index / (prices.length - 1) * (width - pad * 2), height - pad - (price - min) / (max - min || 1) * (height - pad * 2)];
  ctx.strokeStyle = '#283040'; ctx.lineWidth = 1; for (let y = 0; y < 4; y += 1) { const line = pad + y * (height - pad * 2) / 3; ctx.beginPath(); ctx.moveTo(pad, line); ctx.lineTo(width - pad, line); ctx.stroke(); }
  const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, `${color}55`); gradient.addColorStop(1, `${color}00`); ctx.beginPath(); prices.forEach((price, index) => { const [x, y] = point(price, index); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.lineTo(width - pad, height - pad); ctx.lineTo(pad, height - pad); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); prices.forEach((price, index) => { const [x, y] = point(price, index); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
};
