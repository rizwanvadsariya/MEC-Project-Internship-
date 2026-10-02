'use strict';

module.exports = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Create your MEC password</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f7f5; color: #202522; font-family: Arial, sans-serif; }
    main { width: min(420px, calc(100% - 32px)); padding: 28px; background: white; border: 1px solid #d9e1dc; border-radius: 12px; box-sizing: border-box; }
    h1 { margin-top: 0; font-size: 26px; } p { color: #5b665f; line-height: 1.45; }
    label { display: block; margin: 18px 0 6px; font-weight: 600; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #b8c5bc; border-radius: 7px; font-size: 16px; }
    button { width: 100%; margin-top: 22px; padding: 13px; border: 0; border-radius: 7px; background: #2e7d32; color: white; font-size: 16px; cursor: pointer; }
    button:disabled { opacity: .6; cursor: wait; } #message { margin-top: 16px; } .error { color: #b3261e; } .success { color: #216e39; }
  </style>
</head>
<body>
  <main>
    <h1>Create your password</h1>
    <p id="intro">Set a password for your MEC account. Use at least 8 characters.</p>
    <form id="form">
      <label for="password">Password</label>
      <input id="password" type="password" minlength="8" required autocomplete="new-password">
      <label for="confirm">Confirm password</label>
      <input id="confirm" type="password" minlength="8" required autocomplete="new-password">
      <button id="submit" type="submit">Create password</button>
    </form>
    <p id="message" role="status"></p>
  </main>
  <script>
    const message = document.getElementById('message');
    const form = document.getElementById('form');
    const button = document.getElementById('submit');
    const inviteToken = new URLSearchParams(window.location.search).get('token');
    if (!inviteToken) {
      form.style.display = 'none';
      message.className = 'error';
      message.textContent = authError || 'This invite link is missing or has expired. Ask the administrator to generate a new invite.';
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = document.getElementById('password').value;
      const confirm = document.getElementById('confirm').value;
      message.className = '';
      if (password !== confirm) { message.className = 'error'; message.textContent = 'Passwords do not match.'; return; }
      button.disabled = true;
      try {
        const response = await fetch('/api/v1/auth/accept-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteToken, password }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'Could not create password.');
        form.style.display = 'none'; message.className = 'success'; message.textContent = 'Password created. You can now sign in to the MEC mobile app.';
      } catch (error) { message.className = 'error'; message.textContent = error.message; button.disabled = false; }
    });
  </script>
</body>
</html>`;