import { useEffect, useState } from "react";
import QRCode from "qrcode";

/* Styles */

export const CSS = `
/* In the components layer */
@layer components {
.selae{
  /* Paper and ink */
  --bg:#EDF0F6; --surface:#FFFFFF; --raised:#F4F6FB; --stock:#FBFAF5;
  --line:#DCE2EE; --line-strong:#C3CBDC;
  --text:#141B3A; --muted:#4F5878; --faint:#838CA8;
  /* Sky */
  --accent:#3550D4; --accent-deep:#22339A; --accent-ink:#FFFFFF; --accent-soft:#E7EBFD;
  --peri:#8C9BF2; --sky:#B9D7F0; --lime:#D8F06A; --lime-ink:#253000; --sand:#EED9AE;
  /* Status */
  --ok:#1E9A61; --ok-ink:#FFFFFF; --bad:#D4433B; --warn:#E0861B; --warn-ink:#2A1603; --dup:#3550D4;
  --g-sky:linear-gradient(180deg,#E4F68A 0%,#A9D6EC 30%,#7D93EC 68%,#4054CF 100%);
  --g-pass:linear-gradient(165deg,#3550D4 0%,#5F74E4 55%,#9AACF4 100%);
  --g-dusk:linear-gradient(170deg,#4054CF 0%,#8C9BF2 58%,#EED9AE 100%);
  --shadow:0 1px 0 rgba(20,27,58,.04),0 10px 28px -18px rgba(20,27,58,.28);
  --f-body:'Barlow',system-ui,-apple-system,'Segoe UI',sans-serif;
  --f-display:'Barlow Condensed','Barlow',system-ui,sans-serif;
  --f-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  font-family:var(--f-body); background:var(--bg); color:var(--text); min-height:100vh;
  font-variant-numeric:tabular-nums; line-height:1.45; font-size:16px;
}
.selae *{box-sizing:border-box}
.selae button{cursor:pointer; font:inherit}
.selae button:disabled{opacity:.45; cursor:not-allowed}
.selae :focus-visible{outline:2px solid var(--accent); outline-offset:2px}
.selae .muted{color:var(--muted)} .selae .faint{color:var(--faint)}
.selae h1,.selae h2,.selae h3{font-family:var(--f-display);font-weight:700;letter-spacing:.005em}
.display{font-family:var(--f-display);font-weight:700;line-height:.98;letter-spacing:.005em}
.caps{text-transform:uppercase;letter-spacing:.02em}
.tag{font-family:var(--f-mono);font-size:.68rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.mono{font-family:var(--f-mono)}
/* buttons */
.btn{white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:.5rem;font-family:var(--f-display);font-weight:600;
  font-size:1.02rem;letter-spacing:.04em;text-transform:uppercase;border-radius:8px;padding:.55rem 1.05rem;
  border:1px solid var(--line-strong);background:var(--surface);color:var(--text);transition:background .15s,border-color .15s,transform .1s}
.btn:hover:not(:disabled){border-color:var(--text)}
.btn:active:not(:disabled){transform:translateY(1px)}
.btn-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn-primary:hover:not(:disabled){background:var(--accent-deep);border-color:var(--accent-deep)}
.btn-lime{background:var(--lime);border-color:var(--lime);color:var(--lime-ink)}
.btn-lime:hover:not(:disabled){border-color:var(--lime-ink)}
.btn-ghost{background:transparent;border-color:transparent}
.btn-ghost:hover:not(:disabled){background:var(--raised);border-color:var(--line)}
.btn-sm{padding:.32rem .7rem;font-size:.9rem}
.iconbtn{width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--text);
  display:inline-flex;align-items:center;justify-content:center;position:relative}
.iconbtn:hover{border-color:var(--line-strong);background:var(--raised)}
/* surfaces */
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.panel-title{font-family:var(--f-display);font-weight:700;font-size:1.35rem;line-height:1.1}
/* A ticket */
.pass{background:var(--surface);border-radius:16px;border:1px solid var(--line);position:relative}
.tear{position:relative;border-top:2px dashed var(--line-strong);margin:0 16px}
.tear:before,.tear:after{content:"";position:absolute;top:-12px;width:22px;height:22px;border-radius:50%;background:var(--bg);border:1px solid var(--line)}
.tear:before{left:-28px;clip-path:inset(0 0 0 50%)}.tear:after{right:-28px;clip-path:inset(0 50% 0 0)}
.tear-v{position:relative}
.tear-v:before,.tear-v:after{content:"";position:absolute;left:-12px;width:22px;height:22px;border-radius:50%;background:var(--bg);border:1px solid var(--line)}
.tear-v:before{top:-12px;clip-path:inset(50% 0 0 0)}.tear-v:after{bottom:-12px;clip-path:inset(0 0 50% 0)}
.pass-wrap{filter:drop-shadow(0 1px 0 rgba(20,27,58,.06)) drop-shadow(0 12px 22px rgba(20,27,58,.12))}
.perf{border:0;border-top:2px dashed var(--line-strong);margin:0}
.perf-v{border-left:2px dashed var(--line-strong)}
.vtext{writing-mode:vertical-rl;transform:rotate(180deg)}
/* inputs */
.field{position:relative}
.field svg{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);color:var(--faint)}
.input,.inp{background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;color:var(--text);width:100%;font:inherit;font-size:1rem}
.input{padding:.7rem .9rem .7rem 2.55rem}
.inp{padding:.62rem .8rem}
.input::placeholder,.inp::placeholder{color:var(--faint)}
.input:focus,.inp:focus{border-color:var(--accent);outline:none;box-shadow:0 0 0 3px var(--accent-soft)}
select.inp{appearance:auto}
textarea.inp{resize:vertical;min-height:110px}
.lbl{display:block;font-family:var(--f-mono);font-size:.68rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:.35rem}
/* chips */
.chip{display:inline-flex;align-items:center;gap:.35rem;font-family:var(--f-mono);font-size:.7rem;font-weight:500;letter-spacing:.06em;
  text-transform:uppercase;padding:.14rem .5rem;border-radius:6px;border:1px solid var(--line-strong);color:var(--muted);white-space:nowrap;background:var(--surface)}
.chip.qr,.chip.barcode{color:var(--accent);border-color:#B8C3F3;background:var(--accent-soft)}
.chip.ocr{color:#4E5A00;border-color:#C8DD5A;background:#F3FAD1}
.chip.confirmed{color:#8A4D06;border-color:#F0C48A;background:#FDF1E0}
.chip.in{color:var(--ok);border-color:#A7DCC2;background:#E8F6EF}
.pill{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--f-mono);font-weight:500;font-size:.7rem;letter-spacing:.1em;
  text-transform:uppercase;padding:.28rem .6rem;border-radius:6px}
.pill.going{background:#E2F4EA;color:#14794B}
.pill.waitlist{background:#FDF0DE;color:#9A5A0B}
.pill.cancelled{background:#FBE5E3;color:#B2332C}
.pill.host{background:var(--accent-soft);color:var(--accent)}
.pill.past{background:var(--raised);color:var(--muted)}
.pill.lime{background:var(--lime);color:var(--lime-ink)}
.seg{display:inline-flex;background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:3px}
.seg button{border:0;background:transparent;color:var(--muted);font-family:var(--f-display);font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;padding:.3rem .75rem;border-radius:7px;font-size:.92rem}
.seg button[aria-pressed="true"]{background:var(--surface);color:var(--accent);box-shadow:0 1px 3px rgba(20,27,58,.12)}
/* tables and lists */
.tbl{width:100%;border-collapse:separate;border-spacing:0}
.tbl th{white-space:nowrap;font-family:var(--f-mono);font-weight:500;color:var(--faint);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;
  text-align:left;padding:.6rem .9rem;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:1}
.tbl td{white-space:nowrap;padding:.6rem .9rem;border-bottom:1px solid var(--line);font-size:.95rem;vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tbody tr:hover td{background:#F8F9FD}
.feed li{display:grid;grid-template-columns:22px 1fr auto;gap:.65rem;padding:.7rem 0;border-bottom:1px solid var(--line)}
.feed li:last-child{border-bottom:0}
/* capacity bar */
.capbar{height:14px;border-radius:999px;background:var(--raised);border:1px solid var(--line);position:relative;overflow:hidden}
.capfill{height:100%;border-radius:999px;transition:width .5s ease}
.captick{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--text)}
/* top bar */
.topbar{position:sticky;top:0;z-index:30;background:rgba(237,240,246,.86);backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:.6rem;background:none;border:0;color:inherit;padding:0}
.brand .word{font-family:var(--f-display);font-weight:700;font-size:1.5rem;letter-spacing:.08em}
.toplink{color:var(--muted);font-family:var(--f-display);font-weight:600;font-size:1.05rem;letter-spacing:.05em;text-transform:uppercase;
  padding:.4rem .75rem;border-radius:8px;background:transparent;border:0;display:inline-flex;align-items:center;gap:.45rem;position:relative}
.toplink:hover{color:var(--text)}
.toplink[aria-current="page"]{color:var(--accent)}
.toplink[aria-current="page"]:after{content:"";position:absolute;left:.75rem;right:.75rem;bottom:-.72rem;height:3px;border-radius:3px 3px 0 0;background:var(--accent)}
.clock{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1;padding:0 .4rem}
.clock .t{font-family:var(--f-display);font-weight:700;font-size:1.25rem;letter-spacing:.03em}
.clock .t .colon{animation:blink 2s steps(1) infinite}
.clock .d{font-family:var(--f-mono);font-size:.62rem;letter-spacing:.14em;color:var(--faint);text-transform:uppercase}
@keyframes blink{50%{opacity:.25}}
@media (max-width:480px){.toplink{padding:.4rem .45rem;font-size:1rem}.toplink[aria-current="page"]:after{left:.45rem;right:.45rem}}
.badge{position:absolute;top:-5px;right:-5px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--bad);color:#fff;
  font-family:var(--f-mono);font-size:.66rem;font-weight:500;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg)}
.popover{position:absolute;right:0;top:calc(100% + 10px);width:min(380px,calc(100vw - 24px));background:var(--surface);border:1px solid var(--line);
  border-radius:14px;box-shadow:0 24px 48px -12px rgba(20,27,58,.3);overflow:hidden;z-index:40}
.notif{display:grid;grid-template-columns:34px 1fr;gap:.7rem;padding:.75rem 1rem;border-bottom:1px solid var(--line);width:100%;text-align:left;background:transparent;border-left:0;border-right:0;border-top:0;color:inherit}
.notif:last-child{border-bottom:0}
.notif:hover{background:var(--raised)}
.notif.unread{background:#F5F7FF}
.notif .ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent)}
/* layout */
.wrap{max-width:1120px;margin-left:auto;margin-right:auto;padding-left:16px;padding-right:16px}
.narrow{max-width:780px;margin-left:auto;margin-right:auto;padding-left:16px;padding-right:16px}
.page-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1rem}
.page-title{font-family:var(--f-display);font-weight:700;font-size:clamp(2.6rem,7vw,4.2rem);line-height:.9;letter-spacing:.01em;text-transform:uppercase}
/* sky art */
.cover{position:relative;border-radius:14px;overflow:hidden;background:var(--c-bg);aspect-ratio:1/1;display:flex;align-items:flex-end;
  padding:1.1rem;color:#fff;isolation:isolate}
.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover .clouds{position:absolute;inset:0;z-index:0;
  background:radial-gradient(ellipse 60% 22% at 20% 78%,rgba(255,255,255,.75),transparent 70%),
             radial-gradient(ellipse 45% 16% at 78% 86%,rgba(255,255,255,.6),transparent 70%),
             radial-gradient(circle at 82% 14%,rgba(255,255,255,.45),transparent 30%)}
svg.trail{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.cover .ctitle{position:relative;z-index:1;font-family:var(--f-display);font-weight:700;font-size:1.5rem;line-height:1;text-wrap:balance;
  text-shadow:0 1px 10px rgba(20,27,58,.35);text-transform:uppercase;letter-spacing:.01em}
.cover.has-img:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(16,22,52,.55));z-index:0}
.cover.wide{aspect-ratio:16/9}
.cal-av{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--f-display);
  font-weight:700;font-size:1.3rem;background:var(--c-bg);flex-shrink:0}
/* Departure board */
.board{background:#111940;color:#EAF0FB;border-radius:14px;overflow:hidden;box-shadow:0 26px 50px -20px rgba(14,20,60,.7);font-size:.92rem}
.board-head,.board-row{display:grid;grid-template-columns:76px minmax(0,1fr) 112px 92px;gap:.8rem;align-items:center;padding:.62rem 1rem}
.board-head{font-family:var(--f-mono);font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:#8E9AD0;background:#0B1234}
.board-row{width:100%;text-align:left;background:transparent;border:0;border-top:1px solid rgba(255,255,255,.08);color:inherit}
.board-row:hover{background:rgba(255,255,255,.06)}
.board .mono{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;line-height:1.3}
@media (max-width:640px){.board-head,.board-row{grid-template-columns:64px minmax(0,1fr) 84px}}
.cover.thumb{width:76px;height:76px;aspect-ratio:auto;padding:0;border-radius:10px;flex-shrink:0}
.sky{background:var(--g-sky);color:#fff;position:relative;overflow:hidden;isolation:isolate}
/* event pass (list card) */
.evpass{display:block;width:100%;text-align:left;color:inherit;border:0;padding:0;background:transparent;cursor:pointer;
  filter:drop-shadow(0 1px 0 rgba(20,27,58,.05)) drop-shadow(0 10px 18px rgba(20,27,58,.08));transition:transform .15s}
.evpass:hover{transform:translateY(-2px)}
.evpass .pass{display:grid;grid-template-columns:10px minmax(0,1fr) auto;height:100%}
.evpass .main{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1.1rem;padding:1rem 1.1rem;align-items:center;min-width:0}
.evpass .stubx{display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:.5rem;padding:.9rem 1rem;
  border-left:2px dashed var(--line-strong);width:124px}
.evpass:hover .ttl{color:var(--accent)}
.evpass[aria-current="true"] .pass{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}
.evpass .ttl{font-family:var(--f-display);font-weight:700;font-size:1.45rem;line-height:1.05;transition:color .15s}
@media (max-width:560px){.evpass .pass{grid-template-columns:8px minmax(0,1fr)}.evpass .stubx{display:none}.evpass .main{gap:.8rem;padding:.85rem}}
.side-band{border-radius:15px 0 0 15px;background:var(--c-bg)}
.datebig{text-align:center;min-width:58px}
.datebig .dy{font-family:var(--f-display);font-weight:700;font-size:2.4rem;line-height:.9}
.datebig .mo{font-family:var(--f-mono);font-size:.66rem;letter-spacing:.16em;color:var(--accent);text-transform:uppercase}
.datebig .wd{font-family:var(--f-mono);font-size:.62rem;letter-spacing:.12em;color:var(--faint);text-transform:uppercase}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.9rem 1.2rem}
.fact .v{font-family:var(--f-display);font-weight:700;font-size:1.3rem;line-height:1.05}
.fact .s{font-size:.85rem;color:var(--muted)}
.barcode{display:block;height:34px;width:100%}
.datebox{width:54px;flex-shrink:0;text-align:center;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}
.datebox .mo{font-family:var(--f-mono);font-size:.62rem;letter-spacing:.14em;background:var(--accent);color:#fff;padding:.14rem 0}
.datebox .dy{font-family:var(--f-display);font-size:1.5rem;font-weight:700;padding:.1rem 0}
/* category tiles and calendars */
.cat{display:flex;flex-direction:column;justify-content:space-between;gap:1rem;padding:1rem;border-radius:14px;border:1px solid var(--line);
  background:var(--surface);text-align:left;color:inherit;min-height:118px;transition:border-color .15s,transform .15s;box-shadow:var(--shadow)}
.cat:hover{border-color:var(--accent);transform:translateY(-2px)}
.cat[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.cat[aria-pressed="true"] .tag{color:rgba(255,255,255,.75)}
.cat .ic{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent)}
.cat[aria-pressed="true"] .ic{background:rgba(255,255,255,.18);color:#fff}
.cal{display:flex;flex-direction:column;gap:.8rem;padding:1.1rem;border-radius:14px;border:1px solid var(--line);background:var(--surface);
  text-align:left;color:inherit;box-shadow:var(--shadow);position:relative;overflow:hidden}
.cal .av{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;
  font-family:var(--f-display);font-weight:700;font-size:1.4rem;background:var(--c-bg)}
.cal[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent),var(--shadow)}
/* slide-over drawer */
.drawer-bg{position:fixed;inset:0;background:rgba(20,27,58,.28);z-index:45;animation:fade .2s ease}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:var(--bg);z-index:46;display:flex;flex-direction:column;
  box-shadow:-24px 0 48px -16px rgba(20,27,58,.35);animation:slidein .28s cubic-bezier(.2,.8,.2,1)}
.drawer .dhead{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.75rem 1rem;border-bottom:1px solid var(--line);background:var(--surface)}
.drawer .dbody{flex:1;overflow:auto;padding:1rem 1rem 1.5rem}
.drawer .dfoot{display:flex;gap:.6rem;padding:.85rem 1rem;border-top:1px solid var(--line);background:var(--surface)}
.drawer .dfoot .btn{flex:1}
@keyframes slidein{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
/* organizer console */
.rail{background:var(--g-pass);color:#fff;position:relative;border-right:2px dashed rgba(255,255,255,.45)}
.rail .tag{color:rgba(255,255,255,.7)}
.mark{width:34px;height:34px;border-radius:9px;position:relative;background:var(--accent);flex-shrink:0}
.mark:before,.mark:after{content:"";position:absolute;width:11px;height:11px;border:3px solid var(--lime)}
.mark:before{top:6px;left:6px;border-right:0;border-bottom:0;border-radius:3px 0 0 0}
.mark:after{bottom:6px;right:6px;border-left:0;border-top:0;border-radius:0 0 3px 0}
.rail .mark{background:rgba(255,255,255,.16)}
.navbtn{display:flex;gap:.7rem;align-items:center;padding:.6rem .8rem;border-radius:9px;color:rgba(255,255,255,.82);font-family:var(--f-display);
  font-weight:600;font-size:1.05rem;letter-spacing:.05em;text-transform:uppercase;width:100%;text-align:left;background:transparent;border:0}
.navbtn:hover{background:rgba(255,255,255,.12);color:#fff}
.navbtn[aria-current="page"]{background:#fff;color:var(--accent)}
.mnav{gap:.25rem;overflow-x:auto}
.mnav .navbtn{width:auto;white-space:nowrap;color:var(--muted)}
.mnav .navbtn[aria-current="page"]{background:var(--accent);color:#fff}
.boarding{border-radius:16px;overflow:hidden;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}
.boarding .band{background:var(--g-pass);color:#fff;padding:1.1rem 1.25rem;position:relative;overflow:hidden}
.boarding .band .tag{color:rgba(255,255,255,.72)}
/* gate scanner */
.viewfinder{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:4/3;border:1px solid #1E2A55;
  background:radial-gradient(ellipse at 50% 38%,#26336a 0%,#141c40 55%,#0b1130 100%);color:#EEF1FA}
.frame{position:absolute;left:18%;right:18%;top:16%;bottom:16%}
.corner{position:absolute;width:42px;height:42px;border:0 solid var(--lime)}
.corner.tl{top:0;left:0;border-top-width:4px;border-left-width:4px;border-top-left-radius:12px}
.corner.tr{top:0;right:0;border-top-width:4px;border-right-width:4px;border-top-right-radius:12px}
.corner.bl{bottom:0;left:0;border-bottom-width:4px;border-left-width:4px;border-bottom-left-radius:12px}
.corner.br{bottom:0;right:0;border-bottom-width:4px;border-right-width:4px;border-bottom-right-radius:12px}
.vf-status{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:.45rem;font-family:var(--f-mono);font-size:.7rem;letter-spacing:.06em;
  background:rgba(11,17,48,.75);padding:.3rem .65rem;border-radius:6px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.idcard{position:absolute;left:50%;top:50%;width:min(58%,320px);aspect-ratio:1.586;background:#F3F5FA;border-radius:12px;
  box-shadow:0 22px 44px rgba(0,0,0,.5);overflow:hidden;color:#1B2440;transform:translate(-50%,-50%) rotate(-3deg);transition:transform .35s ease,opacity .3s ease}
.idcard.away{opacity:0;transform:translate(-50%,-34%) rotate(-3deg) scale(.92)}
.idcard .band{height:21%;background:#7B1E2A;color:#fff;font-weight:700;font-size:.62rem;display:flex;align-items:center;padding:0 7%}
.idcard .photo{position:absolute;left:7%;top:30%;width:23%;height:43%;background:#C5CEE2;border-radius:4px}
.idcard .info{position:absolute;left:36%;top:30%;right:7%}
.idcard .ln{height:7px;background:#D3DAE8;border-radius:3px;margin-bottom:6px}
.idcard .num{display:inline-block;font-weight:700;font-size:.9rem;padding:1px 5px;margin:2px 0 0 -5px;border-radius:4px}
.idcard .num.reading{outline:2px solid #8DAA16;outline-offset:1px;background:rgba(216,240,106,.45)}
.idcard .bars{position:absolute;left:7%;right:7%;bottom:8%;height:13%;
  background:repeating-linear-gradient(90deg,#1B2440 0 2px,transparent 2px 4px,#1B2440 4px 5px,transparent 5px 8px,#1B2440 8px 11px,transparent 11px 13px)}
.glare{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 72% 74%,rgba(255,255,255,.97) 0%,rgba(255,255,255,.82) 16%,rgba(255,255,255,0) 42%)}
.viewfinder video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;background:#0b1130}
.viewfinder video.frozen{filter:grayscale(.15) brightness(.8)}
.viewfinder .btn{border-color:rgba(255,255,255,.3)}
.vf-ocr{position:absolute;right:3%;top:3.5%;z-index:3}
.vf-note{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);background:rgba(11,17,48,.82);color:#fff;
  font-weight:600;font-size:.85rem;padding:.3rem .7rem;border-radius:6px;white-space:nowrap;max-width:94%;overflow:hidden;text-overflow:ellipsis}
.vf-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:1.5rem;text-align:center}
.vf-center p{max-width:42ch;color:#B9C2E0;line-height:1.55}
.vf-center ol{text-align:left;color:#B9C2E0;font-size:.92rem;line-height:1.6;max-width:42ch}
.camselect{background:var(--surface);border:1px solid var(--line-strong);border-radius:8px;color:var(--text);padding:.32rem .55rem;font:inherit;font-size:.88rem;max-width:220px}
.spin{width:26px;height:26px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--accent);animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.sweep{position:absolute;left:0;right:0;height:3px;background:var(--lime);box-shadow:0 0 14px var(--lime);animation:sweep 1s ease-in-out infinite alternate}
@keyframes sweep{from{top:4%}to{top:96%}}
.ocr-tag{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);background:var(--lime);color:var(--lime-ink);
  font-weight:700;font-size:.85rem;padding:.3rem .7rem;border-radius:6px;white-space:nowrap}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem}
.step{border-top:3px solid var(--line);padding-top:.45rem;font-family:var(--f-mono);font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.step.active{border-color:var(--accent);color:var(--text)}
.step.done{border-color:var(--peri);color:var(--muted)}
.step.skipped{border-style:dashed;opacity:.6}
.result{border-radius:14px;padding:1.4rem;height:100%;min-height:260px;display:flex;flex-direction:column;gap:.9rem;transition:background-color .18s ease}
.result.idle{background:var(--surface);border:1px solid var(--line)}
.result.ok{background:var(--ok);color:var(--ok-ink)}
.result.bad{background:var(--bad);color:#fff}
.result.dup{background:var(--dup);color:#fff}
.result.warn{background:var(--warn);color:var(--warn-ink)}
@media (min-width:1024px){.result{min-height:400px}}
.result .who{text-wrap:balance;font-family:var(--f-display);font-size:clamp(2rem,3.4vw,2.9rem);font-weight:700;line-height:1;letter-spacing:.005em}
.result .state{display:flex;align-items:center;gap:.6rem;font-family:var(--f-display);font-size:1.4rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.result .meta{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;font-size:1rem}
.result .meta dt{opacity:.75}
.result .btn-on{background:rgba(255,255,255,.94);color:#141B3A;border-color:transparent}
.result .btn-on:hover:not(:disabled){background:#fff}
.countdown{height:6px;border-radius:999px;background:rgba(0,0,0,.18);overflow:hidden;margin-top:auto}
.countdown > div{height:100%;background:currentColor;opacity:.5;animation-name:drain;animation-timing-function:linear;animation-fill-mode:forwards}
@keyframes drain{from{width:100%}to{width:0}}
.cand{display:flex;justify-content:space-between;align-items:center;gap:1rem;width:100%;text-align:left;
  background:rgba(255,255,255,.45);border:2px solid transparent;border-radius:12px;padding:.75rem 1rem;color:inherit}
.cand:hover{border-color:currentColor;background:rgba(255,255,255,.62)}
.suggest{position:absolute;left:0;right:0;bottom:calc(100% + 6px);background:var(--surface);border:1px solid var(--line);
  border-radius:12px;overflow:hidden;z-index:5;box-shadow:0 18px 36px rgba(20,27,58,.2)}
.suggest button{display:flex;justify-content:space-between;gap:1rem;width:100%;text-align:left;background:transparent;border:0;
  color:var(--text);padding:.6rem .9rem;border-bottom:1px solid var(--line)}
.suggest button:last-child{border-bottom:0}
.suggest button:hover,.suggest button[data-active="true"]{background:var(--raised)}
.hold{position:relative;overflow:hidden}
.hold .fill{position:absolute;left:0;top:0;bottom:0;background:var(--lime)}
.demo summary{cursor:pointer;font-family:var(--f-display);font-weight:600;font-size:1.05rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);list-style:none}
.demo summary::-webkit-details-marker{display:none}
/* dialogs and feedback */
.modal-bg{position:fixed;inset:0;background:rgba(20,27,58,.42);backdrop-filter:blur(3px);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;animation:fade .18s ease}
.modal{background:var(--surface);border:1px solid var(--line);border-radius:16px;max-width:440px;width:100%;padding:1.25rem;max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 30px 60px -20px rgba(20,27,58,.45)}
.modal.scan{max-width:1180px;padding:0;display:flex;flex-direction:column;background:var(--bg)}
.modal.scan .mhead{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1.1rem;background:var(--g-pass);color:#fff;position:sticky;top:0;z-index:6}
.modal.scan .mhead .tag{color:rgba(255,255,255,.72)}
.modal.scan .mhead .btn{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35);color:#fff}
.modal.scan .mhead .btn:hover:not(:disabled){background:rgba(255,255,255,.24)}
.modal.scan .mhead .hold .fill{background:rgba(216,240,106,.6)}
.toast{position:fixed;right:20px;bottom:20px;background:var(--text);color:#fff;padding:.7rem 1rem;border-radius:10px;font-weight:600;z-index:60;box-shadow:0 16px 32px -12px rgba(20,27,58,.5)}
.alert{border-radius:10px;padding:.75rem 1rem;font-weight:600}
.alert.err{background:#FBE5E3;color:#9B2A23;border:1px solid #F1B9B4}
.alert.ok{background:#E2F4EA;color:#14794B;border:1px solid #A7DCC2}
.copyrow{display:flex;gap:.5rem}
.copyrow input{flex:1;min-width:0}
code{font-family:var(--f-mono);font-size:.88em;background:var(--raised);padding:.05rem .35rem;border-radius:5px}
.qrbox{background:#fff;border-radius:12px;padding:10px;display:inline-block;line-height:0;border:1px solid var(--line)}
.qrbox svg{width:100%;height:auto;display:block}
.swatch{width:30px;height:30px;border-radius:10px;border:3px solid transparent;cursor:pointer}
.swatch[aria-pressed="true"]{border-color:var(--text);box-shadow:0 0 0 2px #fff inset}
.factrow{display:flex;gap:.8rem;align-items:flex-start}
.facticon{width:40px;height:40px;border-radius:10px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0;background:var(--surface)}
.testgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem}
.testcard{background:#fff;color:#141B3A;border-radius:14px;padding:1rem;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.3rem;border:1px solid var(--line)}
.testcard .qrbox{padding:0;width:170px;border:0}
.dropzone{border:2px dashed var(--line-strong);border-radius:14px;padding:1.4rem;text-align:center;background:var(--surface);transition:border-color .15s,background .15s}
.dropzone.over{border-color:var(--accent);background:var(--accent-soft)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem}
.gallery .ph{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:4/3;background:var(--raised);border:0;padding:0}
.gallery .ph img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.gallery .ph:hover img{transform:scale(1.04)}
.gallery .del{position:absolute;top:6px;right:6px;width:30px;height:30px;border-radius:8px;border:0;background:rgba(20,27,58,.7);color:#fff;display:flex;align-items:center;justify-content:center}
.lightbox{position:fixed;inset:0;background:rgba(11,17,48,.92);z-index:70;display:flex;align-items:center;justify-content:center;padding:24px}
.lightbox img{max-width:100%;max-height:100%;border-radius:10px}
.lightbox .iconbtn{position:absolute;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff}
@media print{
  .selae{background:#fff;color:#000} .rail,.selae header,.topbar,.noprint{display:none !important}
  .testcard{border:1px solid #999;break-inside:avoid}
}
@media (prefers-reduced-motion: reduce){ .selae *{animation:none !important; transition:none !important} }
}
`;

/* ---------------- formatting ---------------- */
export const fmtTime = (d) => {
  d = new Date(d);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
};
export const fmtDate = (d, opts = { weekday: "long", month: "long", day: "numeric" }) => new Date(d).toLocaleDateString("en-US", opts);
export const fmtDateShort = (d) => fmtDate(d, { weekday: "short", month: "short", day: "numeric" });
export function fmtRange(start, end) {
  const s = new Date(start), e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${fmtDate(s)}, ${fmtTime(s)} to ${fmtTime(e)}`
    : `${fmtDateShort(s)}, ${fmtTime(s)} to ${fmtDateShort(e)}, ${fmtTime(e)}`;
}
export const formatName = (s) =>
  s.first || s.last
    ? `${s.last}${s.suffix ? " " + s.suffix : ""}, ${s.first}${s.middle ? " " + s.middle + "." : ""}`
    : s.id;
export const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const pct = (n) => `${Math.round((Number.isFinite(n) ? n : 0) * 100)}%`;

// Name formatting
export function tidyName(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}
export const tidyInitial = (raw) => { const m = String(raw || "").trim().match(/\p{L}/u); return m ? m[0].toUpperCase() : ""; };

export function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const CONFUSE = { 0: "8", 1: "7", 2: "7", 3: "8", 4: "9", 5: "6", 6: "5", 7: "1", 8: "3", 9: "4" };
const rand = (a, b) => a + Math.random() * (b - a);
export function simulateRead(id, kind, twin) {
  const digits = id.replace(/\D/g, "").split("");
  const conf = digits.map(() => rand(0.88, 0.99));
  if (kind === "hard" && twin) {
    const other = twin.replace(/\D/g, "");
    const diffs = digits.map((d, i) => (d !== other[i] ? i : -1)).filter((i) => i >= 0);
    diffs.forEach((i, k) => { if (k % 2 === 1) digits[i] = other[i]; conf[i] = rand(0.25, 0.4); });
  } else {
    // Single glare digit
    const i = 4 + Math.floor(Math.random() * 5);
    digits[i] = CONFUSE[digits[i]];
    conf[i] = rand(0.45, 0.7);
  }
  return { read: digits.join(""), conf };
}

export const METHOD_LABEL = { qr: "QR ticket", barcode: "ID barcode", ocr: "OCR", confirmed: "Operator confirmed", manual: "Manual entry" };
export const METHOD_SHORT = { qr: "QR", barcode: "ID barcode", ocr: "OCR", confirmed: "Confirmed", manual: "Manual" };
export const OUTCOME_LABEL = {
  approved: "Checked in", notreg: "Not registered", dup: "Already checked in", full: "Venue at capacity",
  unresolved: "Couldn't identify", waitlist: "On the waitlist", wrongevent: "Ticket for another event",
};

/* ---------------- event covers: sky art ---------------- */
export const COLORS = {
  gold: ["#E4F68A", "#9CC9E6", "#4F64D6"], blue: ["#B9D7F0", "#6E8BEA", "#2C3FB5"], green: ["#DDF3C5", "#7FCBC0", "#3C6FC4"],
  rose: ["#F6D3B8", "#C79BE0", "#4C4FC4"], violet: ["#EED9AE", "#8C9BF2", "#3A3FA8"], teal: ["#CFEFF2", "#5FB4D6", "#2B4FB0"],
};
export const COLOR_NAMES = { gold: "Dawn", blue: "Noon", green: "Lagoon", rose: "Sunset", violet: "Dusk", teal: "Harbor" };
export const skyOf = (key) => { const [a, b, c] = COLORS[key] || COLORS.gold; return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`; };

export function Trails({ seed = "selae", opacity = 0.7 }) {
  const h = hashOf(seed);
  const y = 18 + (h % 30), y2 = 60 + ((h >> 5) % 25), bend = 30 + ((h >> 9) % 40);
  return (
    <svg className="trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1.2, 2.4, 3.6, 4.8].map((d, i) => (
        <path key={i} d={`M-5 ${y2 + d} C ${bend} ${y2 - 10 + d}, ${60 - d} ${y + 12}, 105 ${y + d * 0.6}`}
          fill="none" stroke="#fff" strokeOpacity={opacity * (1 - i * 0.16)} strokeWidth={0.35} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

export function hashOf(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function Cover({ event, thumb = false, className = "", showTitle = true }) {
  const img = event.coverImage;
  return (
    <div className={`cover ${thumb ? "thumb" : ""} ${img ? "has-img" : ""} ${className}`} style={{ "--c-bg": skyOf(event.color) }} aria-hidden="true">
      {img ? <img src={img} alt="" loading="lazy" /> : <><div className="clouds" /><Trails seed={event.id || event.title} /></>}
      {!thumb && showTitle && <div className="ctitle">{event.title}</div>}
    </div>
  );
}

export function Barcode({ value, height = 34, color = "currentColor", className = "" }) {
  const bars = [];
  let x = 0, h = hashOf(value);
  for (let i = 0; i < 46; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const w = 1 + (h % 3), gap = 1 + ((h >> 3) % 2);
    bars.push(<rect key={i} x={x} y="0" width={w} height={height} />);
    x += w + gap;
  }
  return (
    <svg className={`barcode ${className}`} viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="none" fill={color} aria-hidden="true" style={{ height }}>{bars}</svg>
  );
}

export const flightNo = (id) => `SL ${String(hashOf(id) % 9000 + 1000)}`;

export function Mark() {
  return <div className="mark" aria-hidden="true" />;
}

/* ---------------- QR code ---------------- */
export function QrCode({ value, size = 220, label }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((s) => { if (alive) setSvg(s); })
      .catch(() => { if (alive) setSvg(""); });
    return () => { alive = false; };
  }, [value]);
  return (
    <div className="qrbox" style={{ width: size }} role="img" aria-label={label || "QR code"}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/* ---------------- hooks ---------------- */
export function useHashRoute() {
  const read = () => (typeof window === "undefined" ? "" : window.location.hash.replace(/^#\/?/, ""));
  const [route, setRoute] = useState(read);
  useEffect(() => {
    // Scroll on page change
    const headOf = (r) => { const [a, b] = r.split("/"); return a === "m" ? `m/${b}` : a || "events"; };
    let last = headOf(read());
    const on = () => { const r = read(); const head = headOf(r); setRoute(r); if (head !== last) window.scrollTo(0, 0); last = head; };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
export const go = (path) => { window.location.hash = `#/${path.replace(/^\//, "")}`; };

export function useToast() {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}
