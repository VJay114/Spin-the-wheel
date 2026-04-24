(function() {
  let participants = [];
  let currentAngle = 0;
  let velocity = 0;
  let rafId = null;
  let spinHistory = [];
  let spinCount = 0;
  let showImages = false;
  let imageCache = {}; // url -> { canvas: offscreenCanvas, src: url } | null | 'loading'
  let rowId = 0;

  const PALETTE = ['#f5c518','#ff4d6d','#7c3aed','#06b6d4','#10b981','#f97316','#e11d48','#8b5cf6','#facc15','#fb923c'];
  const MAX_VEL  = 0.30;
  const BOOST    = 0.06;
  const FRICTION = 0.987;
  const STOP_VEL = 0.0007;

  const canvas = document.getElementById('wheel');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const CX = W/2, CY = H/2, R = W/2 - 10;

  // Preload image into an offscreen canvas (no crossOrigin needed)
  function preloadImage(url) {
    if (!url || imageCache[url]) return;
    imageCache[url] = 'loading';
    const img = new Image();
    img.onload = function() {
      try {
        const oc = document.createElement('canvas');
        oc.width = oc.height = 80;
        const octx = oc.getContext('2d');
        octx.drawImage(img, 0, 0, 80, 80);
        imageCache[url] = { canvas: oc, src: url };
      } catch(e) {
        imageCache[url] = null;
      }
      drawWheel(currentAngle);
    };
    img.onerror = function() { imageCache[url] = null; };
    img.src = url;
  }

  function getCachedCanvas(url) {
    var c = imageCache[url];
    return (c && c.canvas) ? c.canvas : null;
  }

  function drawWheel(angle) {
    ctx.clearRect(0, 0, W, H);
    if (participants.length === 0) {
      ctx.fillStyle = '#1e1e22';
      ctx.beginPath(); ctx.arc(CX,CY,R,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#444450'; ctx.font = 'bold 15px DM Sans';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Add participants ->', CX, CY);
      return;
    }

    var slice = (2*Math.PI) / participants.length;

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var start = angle + i*slice;
      var end   = start + slice;
      var mid   = start + slice/2;

      // Segment
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R, start, end);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Avatar
      var oc = showImages && p.url ? getCachedCanvas(p.url) : null;
      if (oc) {
        var ir   = Math.min(R * 0.15, 22);
        var dist = R * 0.63;
        var ix   = CX + Math.cos(mid) * dist;
        var iy   = CY + Math.sin(mid) * dist;

        // Circular clip for avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(ix, iy, ir, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(oc, ix - ir, iy - ir, ir*2, ir*2);
        ctx.restore();

        // White ring around avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(ix, iy, ir + 1.5, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Label
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.8)';
      ctx.shadowBlur = 4;
      var fs = participants.length > 12 ? 10 : participants.length > 7 ? 12 : 14;
      ctx.font = '600 ' + fs + 'px DM Sans';
      var ml = 13;
      var lbl = p.name.length > ml ? p.name.slice(0, ml-1) + '...' : p.name;
      var tx = oc ? R - R*0.36 : R - 16;
      ctx.fillText(lbl, tx, 0);
      ctx.restore();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function startLoop() {
    if (rafId) return;
    function loop() {
      if (velocity > STOP_VEL) {
        currentAngle += velocity;
        velocity *= FRICTION;
        drawWheel(currentAngle);
        updateSpeedBar();
        rafId = requestAnimationFrame(loop);
      } else {
        velocity = 0; rafId = null;
        updateSpeedBar();
        if (participants.length > 0) showResult(getWinner());
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  // ── Sound Engine (Web Audio API) ──
  var audioCtx = null;
  var tickInterval = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTick(vel) {
    try {
      var ac = getAudioCtx();
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.setValueAtTime(180 + (vel / MAX_VEL) * 700, ac.currentTime);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.055);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.06);
    } catch(e) {}
  }

  function playBoostWhoosh() {
    try {
      var ac = getAudioCtx();
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(420, ac.currentTime + 0.14);
      gain.gain.setValueAtTime(0.22, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.2);
    } catch(e) {}
  }

  function playWinnerFanfare() {
    try {
      var ac = getAudioCtx();
      // Rising chord: C5 E5 G5 C6
      [523, 659, 784, 1047].forEach(function(freq, i) {
        var osc = ac.createOscillator(), gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        var t = ac.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t); osc.stop(t + 0.45);
      });
      // Sparkle shimmer after
      setTimeout(function() {
        try {
          var ac2 = getAudioCtx();
          [1200, 1600, 2000].forEach(function(freq, i) {
            var o = ac2.createOscillator(), g = ac2.createGain();
            o.connect(g); g.connect(ac2.destination);
            o.type = 'sine'; o.frequency.value = freq;
            var t = ac2.currentTime + i * 0.07;
            g.gain.setValueAtTime(0.1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            o.start(t); o.stop(t + 0.25);
          });
        } catch(e) {}
      }, 500);
    } catch(e) {}
  }

  function startTickScheduler() {
    if (tickInterval) return;
    tickInterval = setInterval(function() {
      if (velocity > STOP_VEL) {
        // tick probability rises with speed for realistic ratchet effect
        var chance = 0.15 + (velocity / MAX_VEL) * 0.85;
        if (Math.random() < chance) playTick(velocity);
      } else {
        clearInterval(tickInterval);
        tickInterval = null;
      }
    }, 38);
  }

  function boost() {
    if (participants.length === 0) return;
    document.getElementById('result').className = 'hidden';
    velocity = Math.min(velocity + BOOST, MAX_VEL);
    updateSpeedBar();
    playBoostWhoosh();
    startTickScheduler();
    startLoop();
  }

  function updateSpeedBar() {
    document.getElementById('speedFill').style.width = Math.min((velocity / MAX_VEL)*100, 100) + '%';
  }

  function getWinner() {
    var slice = (2*Math.PI) / participants.length;
    var angle = ((currentAngle % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
    var adj   = ((2*Math.PI) - angle + 2*Math.PI) % (2*Math.PI);
    return participants[Math.floor(adj / slice) % participants.length];
  }

  function showResult(p) {
    spinCount++;
    spinHistory.unshift({ n: spinCount, name: p.name, url: p.url });
    if (spinHistory.length > 8) spinHistory.pop();

    playWinnerFanfare();

    var r = document.getElementById('result');
    r.textContent = 'Winner: ' + p.name; r.className = 'show';

    setTimeout(function() {
      var avatar = document.getElementById('modal-avatar');
      var emoji  = document.getElementById('modal-emoji');
      if (showImages && p.url) {
        avatar.src = p.url;
        avatar.className = 'modal-avatar visible';
        emoji.style.display = 'none';
      } else {
        avatar.src = '';
        avatar.className = 'modal-avatar'; emoji.style.display = '';
      }
      document.getElementById('modal-winner').textContent = p.name;
      document.getElementById('modal').classList.add('open');
    }, 500);

    renderHistory();
  }

  function renderHistory() {
    var ul = document.getElementById('history-list');
    ul.innerHTML = spinHistory.map(function(h) {
      var im = (showImages && h.url) ? '<img src="' + h.url + '" alt=""/>' : '';
      return '<li>' + im + '<span class="hname">' + h.name + '</span><span class="hnum">#' + h.n + '</span></li>';
    }).join('');
  }

  // Table row management
  function addRow(name, url) {
    name = name || ''; url = url || '';
    var id = rowId++;
    var tr = document.createElement('tr');
    tr.dataset.id = id;
    var imgVis = showImages ? '' : 'none';
    tr.innerHTML =
      '<td class="row-num"></td>' +
      '<td><input type="text" class="name-input" placeholder="Enter name" autocomplete="off"/></td>' +
      '<td class="img-col" style="display:' + imgVis + '">' +
        '<div class="img-cell">' +
          '<img class="img-preview" src="" alt=""/>' +
          '<input type="text" class="url-input" placeholder="https://..." autocomplete="off"/>' +
        '</div>' +
      '</td>' +
      '<td><button class="del-btn" type="button" title="Remove">x</button></td>';

    var ni   = tr.querySelector('.name-input');
    var ui   = tr.querySelector('.url-input');
    var prev = tr.querySelector('.img-preview');

    ni.value = name; ui.value = url;
    ni.addEventListener('input', syncParticipants);
    ui.addEventListener('input', function() { syncParticipants(); refreshPreview(ui.value, prev); });
    tr.querySelector('.del-btn').addEventListener('click', function() { tr.remove(); syncParticipants(); });

    if (url) refreshPreview(url, prev);
    document.getElementById('tbody').appendChild(tr);
    syncParticipants();
  }

  function refreshPreview(url, imgEl) {
    if (!url) { imgEl.classList.remove('visible'); return; }
    imgEl.src = url;
    imgEl.onload  = function() { imgEl.classList.add('visible'); };
    imgEl.onerror = function() { imgEl.classList.remove('visible'); };
    preloadImage(url);
  }

  function syncParticipants() {
    var rows = document.querySelectorAll('#tbody tr');
    participants = [];
    rows.forEach(function(tr, i) {
      tr.querySelector('.row-num').textContent = i + 1;
      var name = tr.querySelector('.name-input').value.trim();
      var url  = tr.querySelector('.url-input').value.trim();
      if (name) {
        participants.push({ name: name, url: url });
        if (url) preloadImage(url);
      }
    });
    document.getElementById('count').textContent =
      participants.length + ' participant' + (participants.length !== 1 ? 's' : '');
    drawWheel(currentAngle);
  }

  document.getElementById('imgToggle').addEventListener('change', function() {
    showImages = this.checked;
    document.querySelectorAll('.img-col').forEach(function(el) {
      el.style.display = showImages ? '' : 'none';
    });
    syncParticipants();
    renderHistory();
  });

  document.getElementById('addRowBtn').addEventListener('click', function() {
    addRow();
    var inputs = document.querySelectorAll('.name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  function handleBoost(e) {
    e.preventDefault();
    boost();
  }

  document.getElementById('spinBtn').addEventListener('mousedown', handleBoost);
  document.getElementById('spinBtn').addEventListener('touchstart', handleBoost, { passive: false });
  document.getElementById('capBtn').addEventListener('mousedown', handleBoost);
  document.getElementById('capBtn').addEventListener('touchstart', handleBoost, { passive: false });

  document.getElementById('clearHistoryBtn').addEventListener('click', function() {
    spinHistory = []; spinCount = 0; renderHistory();
    document.getElementById('result').className = 'hidden';
  });

  document.getElementById('modal-close').addEventListener('click', function() {
    document.getElementById('modal').classList.remove('open');
  });

  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (document.getElementById('modal').classList.contains('open')) {
        document.getElementById('modal').classList.remove('open');
      } else {
        boost();
      }
    }
    if (e.code === 'Escape') document.getElementById('modal').classList.remove('open');
  });

  // Init with sample data
  var samples = [
    { name: 'Alice',   url: 'https://i.pravatar.cc/80?img=1' },
    { name: 'Bob',     url: 'https://i.pravatar.cc/80?img=3' },
    { name: 'Charlie', url: 'https://i.pravatar.cc/80?img=5' },
    { name: 'Diana',   url: 'https://i.pravatar.cc/80?img=9' },
    { name: 'Ethan',   url: 'https://i.pravatar.cc/80?img=12' },
    { name: 'Fiona',   url: 'https://i.pravatar.cc/80?img=16' },
  ];
  samples.forEach(function(s) { addRow(s.name, s.url); });
  drawWheel(0);
})();
