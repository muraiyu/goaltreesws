// アカウント登録・ログイン(Firebase)。ログインすると、アプリのデータをアカウントに保存して端末間で同期する。
// アプリ本体は claude.ai の保存の仕組み(window.claude.use)で同期するので、同じ形の窓口を Firebase で用意する。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const cfg = window.FIREBASE_CONFIG;
const app = initializeApp(cfg), auth = getAuth(app), fs = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
const GUEST = "goaltree2.guest";

const wrap = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const dbAdapter = {
  doc(path) {
    const ref = doc(fs, path);
    return {
      get: async () => wrap(await getDoc(ref)),
      set: data => setDoc(ref, data),
      onSnapshot: (next, err) => onSnapshot(ref, s => next(wrap(s)), err || (() => {})),
    };
  },
};

const MSG = {
  "auth/invalid-email": "メールアドレスの形が正しくありません。",
  "auth/missing-password": "パスワードを入れてください。",
  "auth/invalid-credential": "メールアドレスかパスワードが違います。",
  "auth/user-not-found": "このメールアドレスのアカウントはありません。",
  "auth/wrong-password": "パスワードが違います。",
  "auth/email-already-in-use": "このメールアドレスはすでに登録されています。ログインしてください。",
  "auth/weak-password": "パスワードは6文字以上にしてください。",
  "auth/too-many-requests": "試した回数が多すぎます。しばらく待ってからやり直してください。",
  "auth/network-request-failed": "通信できませんでした。ネットにつながっているか確かめてください。",
};
const msg = e => MSG[e && e.code] || "うまくいきませんでした。もう一度試してください。";

// ---------- ログイン画面 ----------
const css = document.createElement("style");
css.textContent = `
#authOv{position:fixed;inset:0;z-index:50;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:calc(20px + env(safe-area-inset-top,0px)) max(20px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(20px,env(safe-area-inset-left,0px));overflow:auto}
#authBox{width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px}
#authBox .brand{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:6px;text-align:center}
#authBox .brand img{width:84px;height:84px;border-radius:20px;box-shadow:0 6px 20px rgba(0,0,0,.15)}
#authBox .brand b{font-size:26px;font-weight:900;letter-spacing:.03em}
#authBox .brand small{font-size:13px;color:var(--ink3)}
#authBox .seg{display:grid;grid-template-columns:1fr 1fr}
#authBox .seg button{padding:8px}
#authBox form{display:flex;flex-direction:column;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px}
#authBox .btn{padding:10px 14px;font-size:15px}
#authErr{color:var(--warn);font-size:13px;min-height:1em}
#authBox .alt{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
#authBox .note{font-size:12px;color:var(--ink3);text-align:center;line-height:1.6}`;
document.head.append(css);

let mode = "login";
function showLogin() {
  let ov = document.getElementById("authOv");
  if (!ov) { ov = document.createElement("div"); ov.id = "authOv"; document.body.append(ov); }
  ov.hidden = false;
  const reg = mode === "register";
  ov.innerHTML = `<div id="authBox">
    <div class="brand"><img src="icon-192.png" alt=""><b>目標ツリー</b><small>目標から逆算する、勉強のタスク管理</small></div>
    <div class="seg" role="group" aria-label="ログインかアカウント登録か"><button type="button" data-m="login" aria-pressed="${!reg}">ログイン</button><button type="button" data-m="register" aria-pressed="${reg}">アカウント登録</button></div>
    <form id="authForm" novalidate>
      <label class="f">メールアドレス<input type="email" id="auEmail" autocomplete="email" required></label>
      <label class="f">パスワード${reg ? "(6文字以上)" : ""}<input type="password" id="auPass" autocomplete="${reg ? "new-password" : "current-password"}" required minlength="6"></label>
      ${reg ? `<label class="f">パスワード(確認)<input type="password" id="auPass2" autocomplete="new-password" required></label>` : ""}
      <div id="authErr" role="alert"></div>
      <button class="btn pri" id="auGo">${reg ? "登録してはじめる" : "ログイン"}</button>
      ${reg ? "" : `<div class="alt"><button type="button" class="link" id="auReset">パスワードを忘れた</button></div>`}
    </form>
    <button type="button" class="link" id="auGuest" style="align-self:center">ログインせずに使う(この端末だけに保存)</button>
    <p class="note">ログインすると、iPhone・iPad・Android・PCで同じデータを使えます。<br>はじめてログインしたときは、この端末のデータがアカウントに引き継がれます。</p>
  </div>`;
  ov.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { mode = b.dataset.m; showLogin(); });
  const err = ov.querySelector("#authErr"), go = ov.querySelector("#auGo");
  ov.querySelector("#authForm").onsubmit = async e => {
    e.preventDefault(); err.textContent = "";
    const em = ov.querySelector("#auEmail").value.trim(), pw = ov.querySelector("#auPass").value;
    if (reg && pw !== ov.querySelector("#auPass2").value) { err.textContent = "確認用のパスワードが一致しません。"; return; }
    go.disabled = true; go.textContent = "お待ちください…";
    try {
      if (reg) await createUserWithEmailAndPassword(auth, em, pw); else await signInWithEmailAndPassword(auth, em, pw);
      try { localStorage.removeItem(GUEST); } catch (_) {}
      location.reload();
    } catch (x) { err.textContent = msg(x); go.disabled = false; go.textContent = reg ? "登録してはじめる" : "ログイン"; }
  };
  const rs = ov.querySelector("#auReset");
  if (rs) rs.onclick = async () => {
    const em = ov.querySelector("#auEmail").value.trim();
    if (!em) { err.textContent = "メールアドレスを入れてから押してください。"; return; }
    try { await sendPasswordResetEmail(auth, em); err.style.color = "var(--accent)"; err.textContent = "パスワードを設定し直すメールを送りました。"; }
    catch (x) { err.textContent = msg(x); }
  };
  ov.querySelector("#auGuest").onclick = () => {
    try { localStorage.setItem(GUEST, "1"); } catch (_) {}
    ov.hidden = true; window.__resolveAuth && window.__resolveAuth(null);
  };
}
window.__showLogin = () => { mode = "login"; showLogin(); };

// ---------- 設定ページにアカウントの欄を足す ----------
let current = null;
function accountCard() {
  const page = document.getElementById("page");
  if (!page || document.getElementById("acct") || !page.textContent.includes("アプリ情報")) return;
  const card = document.createElement("section");
  card.className = "card"; card.id = "acct";
  card.innerHTML = current
    ? `<h2>アカウント</h2><div class="set-row"><div class="d"><span>ログイン中</span><small>${current.email.replace(/[<>&"]/g, "")}</small></div><button class="btn danger" id="acOut">ログアウト</button></div>`
    : `<h2>アカウント</h2><div class="set-row"><div class="d"><span>ログインしていません</span><small>データはこの端末だけに保存されています。ログインすると端末間で同期できます。</small></div><button class="btn pri" id="acIn">ログイン・登録</button></div>`;
  const head = page.querySelector("header.top");
  head ? head.after(card) : page.prepend(card);
  const out = card.querySelector("#acOut");
  if (out) out.onclick = async () => {
    // 共用の端末でほかの人に見られないよう、この端末に残っているデータも消す
    try { localStorage.removeItem("goaltree2.state"); } catch (_) {}
    await signOut(auth); location.reload();
  };
  const inn = card.querySelector("#acIn");
  if (inn) inn.onclick = () => window.__showLogin();
}
new MutationObserver(accountCard).observe(document.getElementById("page"), { childList: true });

onAuthStateChanged(auth, user => {
  current = user;
  if (user) {
    const ov = document.getElementById("authOv"); if (ov) ov.hidden = true;
    window.__resolveAuth && window.__resolveAuth({ db: dbAdapter, user: { id: async () => user.uid } });
  } else {
    let guest = false; try { guest = localStorage.getItem(GUEST) === "1"; } catch (_) {}
    if (guest) window.__resolveAuth && window.__resolveAuth(null); else showLogin();
  }
  accountCard();
});
