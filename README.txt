HEARING ASSISTANT WEBSITE FILES

Hosted on GitHub Pages (preferred). See WEBSITE-URL.txt for the live URL once published.

FILES
- index.html: Main marketing page + facility waitlist form (facility name + contact email)
- admin.html: Simple admin list of facility submissions (needs Apps Script URL)
- styles.css: Carolina-blue design and mobile layout
- hearing-assistant-aurora-header.jpg: Top banner only. The rest of the page stays this layout.
- logo-source.png: App logo artwork. logo-512/192/64/32.png and .webp are the square mark (no wordmark).
- facility-waitlist.gs: Google Apps Script for a free Google Sheet waitlist
- qr-code.svg: QR code linking to Hearing Assistant on Google Play
- WEBSITE-URL.txt: Public website and Google Play addresses

STEPS
1. Open index.html locally in a browser to preview.
2. Host on GitHub Pages (static files from this folder on the main branch / docs or root).
3. Optional Google Sheet waitlist (recommended):
   - Create a blank Google Sheet.
   - Extensions → Apps Script → paste facility-waitlist.gs.
   - Run setupSheet() once (authorize when asked).
   - Deploy → New deployment → Web app
     Execute as: Me
     Who has access: Anyone
   - Paste the web app URL into WAITLIST_ENDPOINT in index.html and admin.html.
   - Change ADMIN_KEY in facility-waitlist.gs from CHANGE_ME before sharing admin.html.
4. Until the Apps Script URL is set, the facility form emails
   simpleassistapps@gmail.com via FormSubmit
   (https://formsubmit.co). The first submit may require one confirmation
   email from FormSubmit — check that inbox and confirm once.

FORM BEHAVIOR
- Managers enter facility name and contact email (both required).
- With WAITLIST_ENDPOINT set: POST saves [Timestamp, Facility Name, Email] to the
  Facilities sheet so Shane can issue free promo codes in submission order.
- With WAITLIST_ENDPOINT empty: FormSubmit fallback emails facility name + email.
- Success message: "You're on the list — we'll contact your facility about a free promo code."

Amplification copy on the site is 10× (phone mockup and feature card).
