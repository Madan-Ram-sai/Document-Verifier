const add = (s, x) => { const li = document.createElement('li'); li.className = s; li.textContent = x; out.append(li); };
go.onclick = async () => {
  out.innerHTML = '';
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(t.id, { t: 'run', dry: dry.checked }).catch(() => add('review', 'Reload the portal tab, then try again'));
};
chrome.runtime.onMessage.addListener(m => { if (m.t === 'log') add(m.s, m.doc + ': ' + m.msg); });
