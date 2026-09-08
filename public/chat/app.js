(() => {
  const history = [];
  const messages = document.querySelector('#messages');
  const welcome = document.querySelector('#welcome');
  const form = document.querySelector('#composer');
  const input = document.querySelector('#message');
  const provider = document.querySelector('#provider');
  const model = document.querySelector('#model');
  const button = form.querySelector('button');
  const clearButton = document.querySelector('#clear-chat');

  function setBusy(isBusy) { button.disabled = isBusy; button.textContent = isBusy ? '…' : '↑'; input.disabled = isBusy; }
  function addMessage(item) {
    const row = document.createElement('div'); row.className = `message-row ${item.role}`;
    const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = item.role === 'user' ? 'คุณ' : '🌿';
    const content = document.createElement('div'); content.className = 'message-content';
    const label = document.createElement('div'); label.className = 'message-label'; label.textContent = item.role === 'user' ? 'คุณ' : 'AI Desk';
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = item.content;
    content.append(label, bubble); row.append(avatar, content); messages.appendChild(row);
  }
  function render() {
    messages.innerHTML = '';
    if (!history.length) { messages.appendChild(welcome); return; }
    history.forEach(addMessage); messages.scrollTop = messages.scrollHeight;
  }
  function showTyping() {
    const row = document.createElement('div'); row.className = 'message-row'; row.id = 'typing';
    row.innerHTML = '<div class="avatar">🌿</div><div class="message-content"><div class="message-label">AI Desk</div><div class="typing"><i></i><i></i><i></i><span>กำลังคิดคำตอบ...</span></div></div>';
    messages.appendChild(row); messages.scrollTop = messages.scrollHeight;
  }
  function resizeInput() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 150)}px`; }

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const text = input.value.trim(); if (!text || button.disabled) return;
    const previousHistory = history.slice(); history.push({ role: 'user', content: text }); input.value = ''; resizeInput(); setBusy(true); render(); showTyping();
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, history: previousHistory, provider: provider.value, model: model.value.trim() || undefined }) });
      const data = await response.json(); history.push({ role: 'assistant', content: data.reply || data.error || 'ไม่ได้รับคำตอบจากระบบ' });
    } catch (error) { history.push({ role: 'assistant', content: `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${error.message}` }); }
    finally { setBusy(false); render(); input.focus(); }
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
  input.addEventListener('input', resizeInput);
  clearButton.addEventListener('click', () => { if (!history.length || window.confirm('ต้องการล้างบทสนทนานี้หรือไม่?')) { history.length = 0; render(); input.focus(); } });
  document.querySelectorAll('.quick-prompt').forEach((quickPrompt) => { quickPrompt.addEventListener('click', () => { input.value = quickPrompt.textContent || ''; resizeInput(); input.focus(); }); });
})();