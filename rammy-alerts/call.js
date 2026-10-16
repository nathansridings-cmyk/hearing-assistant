/* A family call inside Rammy. No account and no meet.jit.si.

Signaling is the public PeerJS broker (0.peerjs.com). Media uses Google STUN
and PeerJS's public TURN. The room id is rammy- plus 16 hex characters.
Mom's screen is the home peer. The family page calls that peer.
*/

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RammyCall = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROOM = /^rammy-[a-f0-9]{16}$/;
  const ALERTS = "https://hearingassistant.app/rammy-alerts/";

  function cleanRoom(value) {
    const text = String(value || "").trim().toLowerCase();
    return ROOM.test(text) ? text : "";
  }

  function roomFromUrl(value) {
    const text = String(value || "");
    const query = text.match(/[?&]call=(rammy-[a-f0-9]{16})/i);
    if (query) return query[1].toLowerCase();
    return cleanRoom(text);
  }

  function peerId(room, role) {
    const id = cleanRoom(room);
    if (!id) return "";
    return id.replace("-", "") + (role === "home" ? "h" : "f");
  }

  function familyUrl(room, name) {
    const id = cleanRoom(room);
    if (!id) return "";
    const who = encodeURIComponent(String(name || "Family").trim() || "Family");
    return ALERTS + "?call=" + id + "&name=" + who;
  }

  function iceServers() {
    return [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "turn:eu-0.turn.peerjs.com:3478", username: "peerjs", credential: "peerjsp" },
      { urls: "turn:us-0.turn.peerjs.com:3478", username: "peerjs", credential: "peerjsp" },
      { urls: "turns:eu-0.turn.peerjs.com:5349", username: "peerjs", credential: "peerjsp" },
      { urls: "turns:us-0.turn.peerjs.com:5349", username: "peerjs", credential: "peerjsp" }
    ];
  }

  let current = null;

  function say(status, text) {
    if (status) status.textContent = text;
  }

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (error) { /* already stopped */ }
    });
  }

  function hide(button) {
    if (button) button.hidden = true;
  }

  function show(button) {
    if (button) button.hidden = false;
  }

  function stop() {
    const session = current;
    current = null;
    if (!session) return;
    session.token += 1;
    if (session.timer) clearTimeout(session.timer);
    if (session.media) {
      try { session.media.close(); } catch (error) { /* already closed */ }
    }
    if (session.peer) {
      try { session.peer.destroy(); } catch (error) { /* already destroyed */ }
    }
    stopTracks(session.localStream);
    if (session.remote) session.remote.srcObject = null;
    if (session.local) session.local.srcObject = null;
    hide(session.cameraButton);
    hide(session.hearButton);
  }

  function play(session, video, stream, withSound) {
    if (!video) return;
    video.setAttribute("playsinline", "");
    video.srcObject = stream;
    video.muted = !withSound;
    const attempt = video.play();
    if (!attempt || !attempt.catch) return;
    attempt.catch(function () {
      if (current !== session) return;
      video.muted = true;
      const retry = video.play();
      if (retry && retry.catch) retry.catch(function () {});
      if (withSound) {
        say(session.status, "Tap to hear.");
        show(session.hearButton);
      }
    });
  }

  function hear(session) {
    const video = session.remote;
    if (!video) return;
    video.muted = false;
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(function () {});
    hide(session.hearButton);
    if (session.localStream) say(session.status, session.connected ? "Connected." : "Waiting for family.");
  }

  function randomSuffix() {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 4; i += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  function start(options) {
    options = options || {};
    const room = cleanRoom(options.room);
    const role = options.role === "family" ? "family" : "home";
    if (!room) {
      say(options.status, "The call room was missing. Hang up and try again.");
      return { ok: false, room: "" };
    }
    if (current && current.room === room && current.role === role) {
      return { ok: true, room: room };
    }
    stop();
    const homeId = peerId(room, "home");
    const session = {
      token: 1,
      room: room,
      role: role,
      remote: options.remote || null,
      local: options.local || null,
      status: options.status || null,
      cameraButton: options.cameraButton || null,
      hearButton: options.hearButton || null,
      peer: null,
      media: null,
      localStream: null,
      timer: 0,
      homeId: homeId,
      myId: role === "home" ? homeId : homeId.slice(0, -1) + "f" + randomSuffix(),
      tries: 0,
      connected: false
    };
    current = session;
    if (session.hearButton) session.hearButton.onclick = function () { hear(session); };
    if (session.cameraButton) session.cameraButton.onclick = function () { openMedia(session); };
    say(session.status, "Starting the call.");
    openMedia(session);
    return { ok: true, room: room, peerId: session.myId };
  }

  function openMedia(session) {
    hide(session.cameraButton);
    const devices = typeof navigator !== "undefined" && navigator.mediaDevices;
    if (!devices || !devices.getUserMedia) {
      say(session.status, "This browser cannot use the camera.");
      return;
    }
    say(session.status, "Turning the camera on.");
    devices.getUserMedia({ audio: true, video: true }).then(function (stream) {
      if (current !== session) {
        stopTracks(stream);
        return;
      }
      stopTracks(session.localStream);
      session.localStream = stream;
      play(session, session.local, stream, false);
      hide(session.cameraButton);
      connect(session);
    }).catch(function () {
      if (current !== session) return;
      say(session.status, "Tap Turn on camera so Rammy can see and hear you.");
      show(session.cameraButton);
    });
  }

  function peerConstructor() {
    const scope = typeof globalThis !== "undefined" ? globalThis : {};
    return scope.Peer || null;
  }

  function connect(session) {
    if (current !== session || session.peer) {
      if (session.role === "family" && session.peer && session.peer.open) dial(session);
      return;
    }
    const PeerCtor = peerConstructor();
    if (!PeerCtor) {
      say(session.status, "The call program did not load. Hang up and try again.");
      return;
    }
    let peer;
    try {
      peer = new PeerCtor(session.myId, {
        host: "0.peerjs.com",
        port: 443,
        path: "/",
        secure: true,
        debug: 0,
        config: { iceServers: iceServers(), sdpSemantics: "unified-plan" }
      });
    } catch (error) {
      say(session.status, "The call did not start. Hang up and try again.");
      return;
    }
    session.peer = peer;
    peer.on("open", function () {
      if (current !== session) return;
      if (session.role === "family") dial(session);
      else if (!session.connected) say(session.status, "Waiting for family.");
    });
    peer.on("call", function (media) {
      if (current !== session || !session.localStream) {
        try { media.close(); } catch (error) { /* not our call */ }
        return;
      }
      answer(session, media);
    });
    peer.on("error", function (error) {
      if (current !== session) return;
      const type = String((error && error.type) || "");
      if (type === "unavailable-id") {
        try { peer.destroy(); } catch (err) { /* replacing it */ }
        session.peer = null;
        session.tries += 1;
        if (session.role === "family" || session.tries > 5) {
          session.myId = session.homeId.slice(0, -1) + "f" + randomSuffix();
        }
        if (session.role === "home" && session.tries > 5) {
          say(session.status, "This call is already open on another screen.");
          return;
        }
        session.timer = setTimeout(function () {
          if (current === session) connect(session);
        }, 1000);
        return;
      }
      if (type === "peer-unavailable" && session.role === "family") {
        say(session.status, "Still reaching Mom.");
        session.timer = setTimeout(function () {
          if (current === session) dial(session);
        }, 2000);
        return;
      }
      if (!session.connected) {
        say(session.status, session.role === "home" ? "Waiting for family." : "Still reaching Mom.");
      }
    });
    peer.on("disconnected", function () {
      if (current !== session || !session.peer) return;
      try { session.peer.reconnect(); } catch (error) { /* try again on the next dial */ }
    });
  }

  function answer(session, media) {
    if (session.media && session.media !== media) {
      try { session.media.close(); } catch (error) { /* previous caller left */ }
    }
    session.media = media;
    try {
      media.answer(session.localStream);
    } catch (error) {
      return;
    }
    watch(session, media);
  }

  function dial(session) {
    if (current !== session || !session.peer || !session.peer.open || !session.localStream) return;
    if (!session.connected) say(session.status, "Calling.");
    let media;
    try {
      media = session.peer.call(session.homeId, session.localStream);
    } catch (error) {
      media = null;
    }
    if (!media) {
      session.timer = setTimeout(function () {
        if (current === session) dial(session);
      }, 2000);
      return;
    }
    session.media = media;
    watch(session, media);
  }

  function watch(session, media) {
    media.on("stream", function (remote) {
      if (current !== session) return;
      session.connected = true;
      play(session, session.remote, remote, true);
      say(session.status, "Connected.");
    });
    media.on("close", function () {
      if (current !== session || session.media !== media) return;
      session.connected = false;
      say(session.status, session.role === "home" ? "Waiting for family." : "Still reaching Mom.");
      if (session.role === "family") {
        session.timer = setTimeout(function () {
          if (current === session) dial(session);
        }, 2000);
      }
    });
  }

  return {
    cleanRoom: cleanRoom,
    roomFromUrl: roomFromUrl,
    peerId: peerId,
    familyUrl: familyUrl,
    iceServers: iceServers,
    alertsBase: ALERTS,
    broker: "0.peerjs.com",
    start: start,
    stop: stop
  };
});
