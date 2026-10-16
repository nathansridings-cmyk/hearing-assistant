/* Decisions the phone can make without a server of its own. */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RammyLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parsePair(text) {
    const raw = String(text || "").trim();
    let query = raw;
    if (raw.indexOf("rammy://pair?") === 0) query = raw.slice("rammy://pair?".length);
    else if (raw.indexOf("://") !== -1) throw new Error("That pairing code is not from Rammy.");
    const params = new URLSearchParams(query);
    const role = params.get("role") || "family";
    if (role !== "family" && role !== "nurse") throw new Error("That pairing code is not from Rammy.");
    const topic = String(params.get("topic") || "").trim().replace(/\s+/g, "-");
    const server = String(params.get("server") || "https://ntfy.sh").replace(/\/$/, "");
    const key = String(params.get("key") || "").trim();
    if (!topic || !key) throw new Error("That pairing code is missing a part.");
    if (server.indexOf("https://") !== 0 && server.indexOf("http://") !== 0) {
      throw new Error("That server is not allowed.");
    }
    return { role: role, topic: topic, server: server, key: key, name: String(params.get("name") || "") };
  }

  function roomIdOf(click) {
    const match = String(click || "").match(/[?&]call=(rammy-[a-f0-9]{16})/i);
    return match ? match[1].toLowerCase() : "";
  }

  function callPage(room) {
    if (!room) return "";
    return "https://hearingassistant.app/rammy-alerts/?call=" + room;
  }

  function shouldRing(message) {
    const title = String((message && message.title) || "");
    const click = String((message && message.click) || "");
    const room = roomIdOf(click);
    const page = callPage(room);
    if (room || /is calling/i.test(title)) {
      return { ring: true, kind: /check in/i.test(title) ? "checkin" : /help/i.test(title) ? "help" : "call", title: title || "Incoming call", room: page };
    }
    if (/please check in/i.test(title)) return { ring: true, kind: "checkin", title: title, room: page };
    if (/help requested/i.test(title)) return { ring: true, kind: "help", title: title, room: page };
    return { ring: false, kind: "", title: title, room: "" };
  }

  function ringFromPlain(plain) {
    if (!plain || plain.origin !== "rammy") return { ring: false };
    if (plain.kind !== "ring") return { ring: false };
    const body = plain.body || {};
    return {
      ring: true,
      kind: body.reason || "call",
      title: body.title || "Incoming call",
      room: body.room_url || ""
    };
  }

  function openIntent(href) {
    const text = String(href || "");
    const query = text.indexOf("?") === -1 ? "" : text.slice(text.indexOf("?") + 1).split("#")[0];
    const params = new URLSearchParams(query);
    const declined = String(params.get("decline") || "").trim().toLowerCase();
    if (/^rammy-[a-f0-9]{16}$/.test(declined)) return { screen: "decline", room: declined, title: "" };
    if (params.get("callback") === "1") return { screen: "callback", room: "", title: "" };
    const room = roomIdOf(text);
    if (params.has("guest")) {
      const token = String(params.get("guest") || "").trim().toLowerCase();
      const clean = /^[a-f0-9]{32}$/.test(token) ? token : "";
      return { screen: "guest", room: room, token: clean, title: "Call Mom" };
    }
    if (room) {
      const who = String(params.get("who") || "").trim() || "Mom";
      return { screen: "ring", room: room, title: who + " is calling - tap Answer" };
    }
    return { screen: "", room: "", title: "" };
  }

  function missedCall(message) {
    const title = String((message && message.title) || "");
    const click = String((message && message.click) || "");
    if (!/missed call/i.test(title)) return { missed: false, title: title, click: "" };
    return { missed: true, title: title, click: click };
  }

  return {
    parsePair: parsePair,
    shouldRing: shouldRing,
    ringFromPlain: ringFromPlain,
    openIntent: openIntent,
    missedCall: missedCall,
    callPage: callPage
  };
});
