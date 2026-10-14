(function () {
  const STORE = "rammy-alerts-v1";
  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const state = load();
  let ringing = null;
  const seen = new Set();

  const $ = (id) => document.getElementById(id);

  function load() {
    if (preview) return previewState();
    try {
      return JSON.parse(localStorage.getItem(STORE)) || blank();
    } catch (error) {
      return blank();
    }
  }

  function blank() {
    return {
      role: "",
      topic: "",
      server: "",
      key: "",
      personName: "",
      yourName: "",
      device: deviceId(),
      health: null,
      visitors: [],
      medications: [],
      changes: []
    };
  }

  function deviceId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function previewState() {
    return {
      role: "family",
      topic: "rammy-sample",
      server: "https://ntfy.sh",
      key: "preview",
      personName: "Mom",
      yourName: "Shane",
      device: "preview",
      health: {
        updated: "2026-10-13T08:10:00",
        disclaimer: "This is not medical advice.",
        tiles: [
          { label: "Heart rate", text: "72", when: "this morning" },
          { label: "Blood pressure", text: "128/76", when: "this morning" },
          { label: "Blood sugar", text: "110", when: "yesterday" },
          { label: "Weight", text: "148 lb", when: "Monday" },
          { label: "Oxygen", text: "97%", when: "this morning" }
        ],
        chart: {
          label: "Heart rate",
          days: [
            { label: "Tue", value: 70 },
            { label: "Wed", value: 74 },
            { label: "Thu", value: 71 },
            { label: "Fri", value: 76 },
            { label: "Sat", value: 73 },
            { label: "Sun", value: 72 },
            { label: "Today", value: 72 }
          ]
        }
      },
      visitors: [
        { id: "1", name: "Pat", role: "nurse", date: "2026-10-14", time: "14:00" },
        { id: "2", name: "Alex", role: "aide", date: "2026-10-15", time: "09:30" }
      ],
      medications: [
        { id: "m1", name: "Morning vitamin", dose: "1 tablet", times: ["08:00"], active: true },
        { id: "m2", name: "Eye drops", dose: "1 drop", times: ["20:00"], active: true }
      ],
      changes: [
        { who: "Shane", what: "Added Morning vitamin, 1 tablet, at 8:00 AM.", when: "2026-10-12T09:00:00", role: "family" }
      ]
    };
  }

  function save() {
    if (preview) return;
    localStorage.setItem(STORE, JSON.stringify(state));
    if (window.RammyNative && RammyNative.savePair) {
      RammyNative.savePair(JSON.stringify({
        role: state.role,
        topic: state.topic,
        server: state.server,
        key: state.key,
        personName: state.personName,
        yourName: state.yourName,
        device: state.device
      }));
    }
  }

  function paired() {
    return Boolean(state.topic && state.key && state.role);
  }

  function show(name) {
    ["pair", "home", "health", "visitors", "meds", "call"].forEach((id) => {
      $("screen-" + id).classList.toggle("hidden", id !== name);
    });
    if (name !== "ring") $("ring").classList.add("hidden");
  }

  function banner(text) {
    const node = $("banner");
    node.textContent = text || "";
    node.classList.toggle("hidden", !text);
  }

  function render() {
    $("who").textContent = paired()
      ? (state.personName || "Mom") + (state.role === "nurse" ? " · Nurse" : "")
      : "Not paired";
    if (!paired()) {
      show("pair");
      return;
    }
    $("home-title").textContent = state.personName || "Mom";
    $("home-role").textContent = state.role === "nurse"
      ? "Nurse access. You can see vitals, visitors, and medicines."
      : "Family access.";
    $("call-mom").classList.toggle("hidden", state.role !== "family");
    renderHealth();
    renderVisitors();
    renderMeds();
    const wanted = (location.hash || "#home").slice(1);
    if (["health", "visitors", "meds", "call", "home"].indexOf(wanted) !== -1) show(wanted);
    else show("home");
  }

  function renderHealth() {
    const health = state.health || {};
    const tiles = health.tiles || [];
    const useful = tiles.filter((tile) => tile.text && tile.text !== "—");
    $("tiles").innerHTML = useful.map((tile) => {
      return "<article class='tile'><span>" + escape(tile.label) + "</span><strong>" +
        escape(tile.text) + "</strong><span>" + escape(tile.when || "") + "</span></article>";
    }).join("");
    $("health-empty").classList.toggle("hidden", useful.length > 0);
    $("health-updated").textContent = health.updated ? "Updated " + health.updated.replace("T", " ") : "";
    const chart = health.chart || { days: [], label: "7 days" };
    $("chart-label").textContent = (chart.label || "Reading") + ", 7 days";
    const values = (chart.days || []).map((day) => Number(day.value) || 0);
    const max = Math.max.apply(null, values.concat([1]));
    $("chart").innerHTML = (chart.days || []).map((day) => {
      const height = Math.round(((Number(day.value) || 0) / max) * 120);
      return "<div class='bar'><i style='height:" + height + "px'></i><b>" + escape(day.label) + "</b></div>";
    }).join("");
  }

  function renderVisitors() {
    const rows = state.visitors || [];
    $("visitor-empty").classList.toggle("hidden", rows.length > 0);
    $("visitor-list").innerHTML = rows.map((row) => {
      return "<li><strong>" + escape(row.name) + "</strong><span>" + escape(roleLabel(row.role)) +
        " · " + escape(row.date) + " at " + escape(clock(row.time)) + "</span>" +
        "<div class='row-actions'><button type='button' data-drop='" + escape(row.id) + "'>Remove</button></div></li>";
    }).join("");
  }

  function renderMeds() {
    const rows = (state.medications || []).filter((row) => row.active !== false);
    $("med-empty").classList.toggle("hidden", rows.length > 0);
    $("med-list").innerHTML = rows.map((row) => {
      const times = (row.times || []).map(clock).join(", ");
      return "<li><strong>" + escape(row.name) + "</strong><span>" + escape(row.dose || "") +
        (times ? " · " + escape(times) : "") + "</span>" +
        "<div class='row-actions'><button type='button' data-med='" + escape(row.id) + "'>Remove</button></div></li>";
    }).join("");
    const changes = state.changes || [];
    $("history-empty").classList.toggle("hidden", changes.length > 0);
    $("history").innerHTML = changes.slice().reverse().map((row) => {
      return "<li><strong>" + escape(row.who) + "</strong> " + escape(row.what) +
        "<br><span>" + escape(String(row.when || "").replace("T", " ")) + " · " + escape(row.role || "") + "</span></li>";
    }).join("");
  }

  function roleLabel(role) {
    if (role === "nurse") return "Nurse";
    if (role === "aide") return "Aide";
    if (role === "family") return "Family";
    return "Other";
  }

  function clock(value) {
    const parts = String(value || "").split(":");
    if (parts.length < 2) return value || "";
    let hour = Number(parts[0]);
    const minute = parts[1];
    const suffix = hour < 12 ? "AM" : "PM";
    hour = hour % 12 || 12;
    return hour + ":" + minute + " " + suffix;
  }

  function escape(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  async function pairFrom(text) {
    const parsed = RammyLogic.parsePair(text);
    RammySeal.keyBytes(parsed.key);
    state.role = parsed.role;
    state.topic = parsed.topic;
    state.server = parsed.server;
    state.key = parsed.key;
    state.personName = parsed.name || state.personName || "Mom";
    state.yourName = $("your-name").value.trim() || state.yourName || (parsed.role === "nurse" ? "Nurse" : "Family");
    if (!state.device) state.device = deviceId();
    save();
    $("pair-code").value = "";
    $("pair-error").textContent = "";
    location.hash = "#home";
    render();
    if (!preview) {
      await send("sync", {});
      watchChannel();
    }
  }

  async function send(kind, body) {
    if (preview || !paired()) return;
    const payload = {
      v: 1,
      origin: "phone",
      device: state.device,
      kind: kind,
      body: body
    };
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const token = RammySeal.seal(state.key, payload, iv);
    const priority = kind === "call_mom" || kind === "meds" ? "high" : "default";
    const title = kind === "meds" ? "Medicine update" : "Rammy";
    if (window.RammyNative && RammyNative.publish) {
      RammyNative.publish(state.server, state.topic, token, title, priority, "rammy");
      return;
    }
    const response = await fetch(state.server.replace(/\/$/, "") + "/" + encodeURIComponent(state.topic), {
      method: "POST",
      headers: { Title: title, Priority: priority, Tags: "rammy" },
      body: token
    });
    if (!response.ok) throw new Error("The alert channel did not accept that.");
  }

  async function poll() {
    if (preview || !paired()) return;
    try {
      let text = "";
      if (window.RammyNative && RammyNative.poll) {
        text = RammyNative.poll(state.server, state.topic, state.since || "10m") || "";
        const marker = text.split("\n").filter(Boolean).pop();
        if (marker && marker.indexOf("{") === 0) {
          try { state.since = JSON.parse(marker).id || state.since; } catch (error) { /* keep */ }
        }
      } else {
        const url = state.server.replace(/\/$/, "") + "/" + encodeURIComponent(state.topic) +
          "/json?poll=1&since=" + encodeURIComponent(state.since || "10m");
        const response = await fetch(url);
        if (!response.ok) throw new Error("offline");
        text = await response.text();
      }
      banner("");
      text.split("\n").forEach(takeLine);
      save();
    } catch (error) {
      banner("Can't reach the alert channel. Trying again.");
    }
  }

  function takeLine(line) {
    line = line.trim();
    if (!line || line.charAt(0) !== "{") return;
    let item;
    try { item = JSON.parse(line); } catch (error) { return; }
    if (!item || typeof item !== "object") return;
    if (item.id) {
      state.since = item.id;
      if (seen.has(item.id)) return;
      seen.add(item.id);
    }
    const message = String(item.message || "");
    if (message.indexOf("R1.") === 0) {
      let plain;
      try { plain = RammySeal.openSeal(state.key, message); } catch (error) { return; }
      if (plain.origin === "phone") return;
      applyPlain(plain);
      return;
    }
    const decision = RammyLogic.shouldRing(item);
    if (decision.ring) startRing(decision, item.id);
  }

  function applyPlain(plain) {
    const body = plain.body || {};
    if (plain.kind === "state") {
      state.personName = body.person_name || state.personName;
      state.health = body.health || state.health;
      state.visitors = body.visitors || [];
      state.medications = body.medications || [];
      state.changes = body.changes || [];
      render();
    } else if (plain.kind === "med_change") {
      if (body.medications) state.medications = body.medications;
      if (body.change) state.changes = (state.changes || []).concat([body.change]).slice(-40);
      banner((body.change && body.change.who ? body.change.who + ": " : "") + ((body.change && body.change.what) || "Medicine update"));
      render();
    } else if (plain.kind === "room" && body.for_device === state.device && body.room_url) {
      openRoom(body.room_url, "Calling " + (state.personName || "Mom"));
    } else if (plain.kind === "ring") {
      const decision = RammyLogic.ringFromPlain(plain);
      if (decision.ring) startRing(decision, plain.id || "");
    }
  }

  const ringer = {
    ctx: null,
    timer: 0,
    nodes: [],
    token: 0,
    unlock() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume();
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const silent = this.ctx.createBufferSource();
      silent.buffer = buffer;
      silent.connect(this.ctx.destination);
      silent.start(0);
      return this.ctx.state === "running";
    },
    start() {
      const token = ++this.token;
      this.silence();
      const ok = this.unlock();
      const hear = $("ring-hear");
      if (hear) hear.classList.toggle("hidden", ok);
      if (!ok) return;
      const pulse = () => {
        if (token !== this.token || !this.ctx) return;
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
        gain.gain.setValueAtTime(0.22, now + 1.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
        [440, 480].forEach((freq) => {
          const osc = this.ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + 1.35);
          this.nodes.push(osc);
        });
      };
      pulse();
      this.timer = window.setInterval(pulse, 2600);
      if (navigator.vibrate) navigator.vibrate([600, 300, 600, 1200]);
    },
    silence() {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = 0;
      this.nodes.forEach((node) => { try { node.stop(); } catch (error) { /* already stopped */ } });
      this.nodes = [];
    },
    stop() {
      this.token += 1;
      this.silence();
      if (navigator.vibrate) navigator.vibrate(0);
    }
  };

  function startRing(decision, id) {
    ringing = { room: decision.room || "", kind: decision.kind, id: id || "" };
    $("ring-title").textContent = decision.title || "Incoming call";
    $("ring-sub").textContent = decision.kind === "checkin"
      ? "Please check in"
      : decision.kind === "help"
        ? "Help alert"
        : "Video call";
    $("ring").classList.remove("hidden");
    ringer.start();
    if (window.RammyNative && RammyNative.ring) {
      RammyNative.ring(decision.title || "Incoming call", decision.room || "", decision.kind || "call");
    }
    if (!preview && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
      const title = decision.title || "Rammy";
      const body = $("ring-sub").textContent;
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body: body,
          icon: "/rammy-alerts/icon-192.png",
          tag: "rammy-ring"
        });
      }).catch(function () {});
    }
  }

  function openRoom(url, title) {
    ringer.stop();
    $("ring").classList.add("hidden");
    if (window.RammyNative && RammyNative.openRoom) {
      RammyNative.openRoom(url);
      return;
    }
    $("call-title").textContent = title || "Video call";
    $("call-status").textContent = "The video opens in this phone. If it stays blank, use Open video.";
    show("call");
    location.hash = "#call";
    const open = $("open-video");
    open.classList.toggle("hidden", !url);
    open.onclick = () => {
      if (!url || preview) {
        $("call-status").textContent = "Sample only. A paired phone opens the video here.";
        return;
      }
      location.href = url;
    };
    if (url && !preview) {
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.title = "Video call";
      frame.allow = "camera; microphone; fullscreen; display-capture";
      frame.style.cssText = "width:100%;height:46vh;border:0;border-radius:20px;background:#000;margin-top:12px";
      const host = $("screen-call");
      const old = host.querySelector("iframe");
      if (old) old.remove();
      host.insertBefore(frame, open);
    }
  }

  $("pair").addEventListener("click", async () => {
    try {
      await pairFrom($("pair-code").value);
    } catch (error) {
      $("pair-error").textContent = error.message || "That pairing code is not from Rammy.";
    }
  });

  let scanStream = null;
  let scanTimer = 0;

  function stopScan() {
    if (scanTimer) window.clearInterval(scanTimer);
    scanTimer = 0;
    if (scanStream) scanStream.getTracks().forEach((track) => track.stop());
    scanStream = null;
    $("scanner").classList.add("hidden");
  }

  $("scan").addEventListener("click", async () => {
    if (window.RammyNative && RammyNative.scan) {
      RammyNative.scan();
      return;
    }
    $("pair-error").textContent = "";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("pair-error").textContent = "This browser has no camera. Paste the pairing code.";
      return;
    }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
    } catch (error) {
      $("pair-error").textContent = "The camera did not open. Paste the pairing code.";
      return;
    }
    const video = $("scan-video");
    video.srcObject = scanStream;
    $("scanner").classList.remove("hidden");
    try { await video.play(); } catch (error) { /* the stream is still attached */ }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const detector = ("BarcodeDetector" in window)
      ? new BarcodeDetector({ formats: ["qr_code"] })
      : null;
    scanTimer = window.setInterval(async () => {
      if (!video.videoWidth) return;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes[0] && codes[0].rawValue) {
            $("pair-code").value = codes[0].rawValue;
            stopScan();
            $("pair").click();
          }
          return;
        }
        if (!window.jsQR) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code && code.data) {
          $("pair-code").value = code.data;
          stopScan();
          $("pair").click();
        }
      } catch (error) { /* keep looking */ }
    }, 280);
  });

  $("scan-close").addEventListener("click", stopScan);

  window.onPairCode = function (text) {
    $("pair-code").value = text || "";
    $("pair").click();
  };

  document.body.addEventListener("click", (event) => {
    const go = event.target.getAttribute && event.target.getAttribute("data-go");
    if (go) {
      location.hash = "#" + go;
      show(go);
    }
  });

  $("call-mom").addEventListener("click", async () => {
    $("call-title").textContent = "Calling " + (state.personName || "Mom");
    $("call-status").textContent = preview
      ? "Sample only. On a paired phone, her screen answers by itself."
      : "Waiting for her screen to answer.";
    show("call");
    if (preview) return;
    try {
      await send("call_mom", { by: state.yourName || "Family", device: state.device });
    } catch (error) {
      banner("Can't reach the alert channel.");
    }
  });

  $("hangup").addEventListener("click", async () => {
    ringer.stop();
    const frame = $("screen-call").querySelector("iframe");
    if (frame) frame.remove();
    $("open-video").classList.add("hidden");
    show("home");
    location.hash = "#home";
    if (!preview && state.role === "family") {
      try { await send("hangup", {}); } catch (error) { banner("Can't reach the alert channel."); }
    }
  });

  $("answer").addEventListener("click", () => {
    ringer.stop();
    const room = ringing && ringing.room;
    ringing = null;
    if (room) openRoom(room, $("ring-title").textContent);
    else {
      $("ring").classList.add("hidden");
      banner("There is no video room with this alert.");
    }
  });

  $("decline").addEventListener("click", () => {
    ringer.stop();
    ringing = null;
    $("ring").classList.add("hidden");
  });

  $("ring").addEventListener("click", (event) => {
    if (event.target.closest && event.target.closest("button")) return;
    if (ringer.unlock() && ringing) ringer.start();
  });

  document.addEventListener("pointerdown", () => { ringer.unlock(); });

  const allow = $("allow-banner");
  if (!("Notification" in window)) allow.classList.add("hidden");
  else if (Notification.permission === "granted") allow.classList.add("hidden");
  else allow.addEventListener("click", async () => {
    const result = await Notification.requestPermission();
    if (result === "granted") allow.classList.add("hidden");
    else banner("Banners stay off. The ntfy app is still the loud ringer.");
  });

  $("visitor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const row = {
      id: "visit-" + Date.now(),
      name: $("visitor-name").value.trim(),
      role: $("visitor-role").value,
      date: $("visitor-date").value,
      time: $("visitor-time").value
    };
    state.visitors = (state.visitors || []).concat([row]);
    save();
    renderVisitors();
    event.target.reset();
    if (!preview) {
      try { await send("visitors", { visitors: state.visitors, who: state.yourName }); }
      catch (error) { banner("Saved on this phone. The home PC did not get it yet."); }
    }
  });

  $("visitor-list").addEventListener("click", async (event) => {
    const id = event.target.getAttribute && event.target.getAttribute("data-drop");
    if (!id) return;
    state.visitors = (state.visitors || []).filter((row) => row.id !== id);
    save();
    renderVisitors();
    if (!preview) {
      try { await send("visitors", { visitors: state.visitors, who: state.yourName }); }
      catch (error) { banner("Saved on this phone. The home PC did not get it yet."); }
    }
  });

  $("med-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const row = {
      id: "med-" + Date.now(),
      name: $("med-name").value.trim(),
      dose: $("med-dose").value.trim(),
      times: [$("med-time").value],
      active: true
    };
    state.medications = (state.medications || []).concat([row]);
    const change = {
      who: state.yourName || "Family",
      what: "Added " + row.name + (row.dose ? ", " + row.dose : "") + ", at " + clock(row.times[0]) + ".",
      when: new Date().toISOString().slice(0, 19),
      role: state.role || "family"
    };
    state.changes = (state.changes || []).concat([change]);
    save();
    renderMeds();
    event.target.reset();
    if (!preview) {
      try { await send("meds", { medications: state.medications, who: state.yourName }); }
      catch (error) { banner("Saved on this phone. The home PC did not get it yet."); }
    }
  });

  $("med-list").addEventListener("click", async (event) => {
    const id = event.target.getAttribute && event.target.getAttribute("data-med");
    if (!id) return;
    const found = (state.medications || []).find((row) => row.id === id);
    state.medications = (state.medications || []).filter((row) => row.id !== id);
    if (found) {
      state.changes = (state.changes || []).concat([{
        who: state.yourName || "Family",
        what: "Removed " + found.name + ".",
        when: new Date().toISOString().slice(0, 19),
        role: state.role || "family"
      }]);
    }
    save();
    renderMeds();
    if (!preview) {
      try { await send("meds", { medications: state.medications, who: state.yourName }); }
      catch (error) { banner("Saved on this phone. The home PC did not get it yet."); }
    }
  });

  window.addEventListener("hashchange", render);

  if (preview) {
    const screen = new URLSearchParams(location.search).get("screen");
    if (screen === "ring") {
      render();
      startRing({ ring: true, kind: "call", title: "Mom is calling", room: "https://meet.jit.si/rammy-sample01234567" }, "preview");
      return;
    }
    if (screen) location.hash = "#" + screen;
  }
  let source = null;
  let watching = false;

  function listen() {
    if (preview || !paired() || !window.EventSource) return;
    if (source) source.close();
    const url = state.server.replace(/\/$/, "") + "/" + encodeURIComponent(state.topic) +
      "/sse?since=" + encodeURIComponent(state.since || "10m");
    source = new EventSource(url);
    source.onmessage = (event) => {
      banner("");
      takeLine(event.data);
      save();
    };
    source.onerror = () => {
      banner("Can't reach the alert channel. Trying again.");
    };
  }

  function registerWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("/rammy-alerts/sw.js", { scope: "/rammy-alerts/" }).catch(function () {});
  }

  function watchChannel() {
    if (preview || !paired() || watching) return;
    watching = true;
    poll();
    listen();
    setInterval(poll, 20000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        poll();
        listen();
      }
    });
  }

  render();
  registerWorker();
  watchChannel();
})();
