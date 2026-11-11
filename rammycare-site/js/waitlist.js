(function () {
  var form = document.getElementById("rammy-waitlist");
  if (!form) return;

  var message = document.getElementById("form-message");
  var submitBtn = form.querySelector('button[type="submit"]');
  var FORMSUBMIT_URL = "https://formsubmit.co/ajax/nathanridings5@gmail.com";

  function show(text, kind) {
    message.hidden = false;
    message.textContent = text;
    message.className = "form-message " + kind;
  }

  function mark(field, invalid) {
    if (!field) return;
    if (invalid) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var nameInput = form.elements.name;
    var emailInput = form.elements.email;
    var whoInput = form.elements.who;
    var noteInput = form.elements.message;
    var honeyInput = form.elements["_honey"];
    var name = (nameInput.value || "").trim();
    var email = (emailInput.value || "").trim();
    var who = (whoInput.value || "").trim();
    var note = (noteInput.value || "").trim();
    var honey = (honeyInput && honeyInput.value || "").trim();

    mark(nameInput, !name);
    mark(emailInput, !email || !emailInput.checkValidity());
    mark(whoInput, !who);

    if (!name) {
      show("Please enter your name.", "error");
      nameInput.focus();
      return;
    }
    if (!email || !emailInput.checkValidity()) {
      show("Please enter a real email address.", "error");
      emailInput.focus();
      return;
    }
    if (!who) {
      show("Please choose who you are.", "error");
      whoInput.focus();
      return;
    }
    if (honey) {
      form.reset();
      show("You're on the list. We'll write back at the email you entered.", "success");
      return;
    }

    submitBtn.disabled = true;
    show("Sending…", "pending");

    fetch(FORMSUBMIT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: name,
        email: email,
        who: who,
        message: note,
        _replyto: email,
        _subject: "Rammy waitlist",
        _template: "table",
        _captcha: "false"
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, data: data };
      });
    }).then(function (result) {
      var failed = !result.ok || (result.data && (result.data.success === false || result.data.success === "false"));
      if (failed) {
        show("That did not send. Email nathanridings5@gmail.com and we'll write back.", "error");
        return;
      }
      form.reset();
      show("You're on the list. We'll write back at the email you entered.", "success");
    }).catch(function () {
      show("That did not send. Email nathanridings5@gmail.com and we'll write back.", "error");
    }).then(function () {
      submitBtn.disabled = false;
    });
  });
})();
