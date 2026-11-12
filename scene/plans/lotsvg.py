# 一樓後側停車場平面圖產生器（美術）：讀同資料夾的 1f-rear-parking.json（依管委會正式車位圖，公尺），輸出 1f-rear-parking.svg。改車位就改 json 再執行 python3 lotsvg.py
import json
L = json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), '1f-rear-parking.json'))); S = 70; PADX, PADY = 70, 120
W, D = L['W'], L['D']
X = lambda x: PADX + x*S
Y = lambda y: PADY + (D - y)*S          # y=0 是南側（中北三街），往上是北
o = []
a = o.append
TW, TH = int(W*S + PADX*2 + 40), int(D*S + PADY + 170)
a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TW} {TH}" width="{TW}" height="{TH}" font-family="Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif">')
a(f'<rect width="{TW}" height="{TH}" fill="#fff8ec"/>')
a(f'<text x="{PADX}" y="34" font-size="24" font-weight="700" fill="#3b2a1a">宏樸日心說 一樓後側露天停車場 平面圖（示意）</text>')
a(f'<text x="{PADX}" y="80" font-size="14" fill="#7a6a58">汽車位 22、23 皆為無障礙兼電動車位；機車位 1–17 法定、18 自設；大門在 11 號後方。</text><text x="{PADX}" y="60" font-size="14" fill="#7a6a58">依管委會車位圖（2026-11-11 使用者提供）重畫，尺寸為圖上標註（公分）；不含車牌、戶號。</text>')
# 地坪
a(f'<rect x="{X(0)}" y="{Y(D)}" width="{W*S}" height="{D*S}" fill="#8f8d89" stroke="#3a3836" stroke-width="2"/>')
for i in range(int(W/0.5)+1): a(f'<line x1="{X(i*.5)}" y1="{Y(D)}" x2="{X(i*.5)}" y2="{Y(0)}" stroke="#7d7b77" stroke-width=".6"/>')
for j in range(int(D/0.5)+1): a(f'<line x1="{X(0)}" y1="{Y(j*.5)}" x2="{X(W)}" y2="{Y(j*.5)}" stroke="#7d7b77" stroke-width=".6"/>')
# 北側大樓牆、西側牆
a(f'<rect x="{X(0)-6}" y="{Y(D)-14}" width="{W*S+12}" height="14" fill="#37383c"/>')
a(f'<text x="{X(3.5)}" y="{Y(D)-22}" font-size="15" text-anchor="middle" fill="#3b2a1a">北　大樓後牆（深灰磁磚）</text>')
dx = L['door']

a(f'<rect x="{X(dx["x"])}" y="{Y(D)-14}" width="{dx["w"]*S}" height="14" fill="#8c4b2a"/>')
a(f'<text x="{X(dx["x"]+dx["w"]/2)}" y="{Y(D)-22}" font-size="14" font-weight="700" text-anchor="middle" fill="#8c4b2a">大門</text>')
a(f'<rect x="{X(0)-14}" y="{Y(D)-14}" width="14" height="{D*S+14}" fill="#37383c"/>')
a(f'<text x="{X(0)-22}" y="{Y(D/2)}" font-size="13" text-anchor="middle" fill="#3b2a1a" transform="rotate(-90 {X(0)-22} {Y(D/2)})">西側牆（防空避難指示、水龍頭）</text>')
# 南側人行道
a(f'<rect x="{X(0)-14}" y="{Y(0)}" width="{W*S+28}" height="34" fill="#c9c3b8"/>')
a(f'<text x="{X(W/2)}" y="{Y(0)+23}" font-size="15" text-anchor="middle" fill="#3b2a1a">人行道</text>')
a(f'<rect x="{X(0)-14}" y="{Y(0)+34}" width="{W*S+28}" height="40" fill="#55534f"/>')
a(f'<text x="{X(W/2)}" y="{Y(0)+60}" font-size="16" text-anchor="middle" fill="#fff">南　中北三街（車輛由此進出）</text>')
def stall(s, col):
    x,y,w,d = s['x'],s['y'],s['w'],s['d']
    a(f'<rect x="{X(x)}" y="{Y(y+d)}" width="{w*S}" height="{d*S}" fill="none" stroke="{col}" stroke-width="4"/>')
# 斜線區
h = L['hatch']
a(f'<clipPath id="hc"><rect x="{X(h["x"])}" y="{Y(h["y"]+h["d"])}" width="{h["w"]*S}" height="{h["d"]*S}"/></clipPath><g clip-path="url(#hc)">')
for k in range(-20,40): a(f'<line x1="{X(h["x"])+k*14}" y1="{Y(h["y"])}" x2="{X(h["x"])+k*14+120}" y2="{Y(h["y"]+h["d"])}" stroke="#fff" stroke-width="4"/>')
a('</g>'); stall(h, '#3d7fc4')
a(f'<text x="{X(h["x"]+h["w"]/2)}" y="{Y(h["y"]+h["d"]/2)}" font-size="12" text-anchor="middle" fill="#fff" stroke="#3a3836" stroke-width="3" paint-order="stroke">下車區</text>')
def chair(cx, cy, s):
    a(f'<rect x="{cx-s/2}" y="{cy-s/2}" width="{s}" height="{s}" fill="#3d7fc4"/>')
    a(f'<text x="{cx}" y="{cy+s*.32}" font-size="{s*.85}" text-anchor="middle" fill="#fff">♿</text>')
for c in L['cars']:
    stall(c, '#3d7fc4')
    if c.get('acc'): chair(X(c['x']+c['w']/2), Y(c['y']+c['d']*.45), 90)
    a(f'<text x="{X(c["x"]+c["w"]/2)}" y="{Y(c["y"]+c["d"])+34}" font-size="26" font-weight="700" text-anchor="middle" fill="#fff">{c["n"]}</text>'); a(f'<text x="{X(c["x"]+c["w"]/2)}" y="{Y(c["y"]+c["d"])+58}" font-size="13" text-anchor="middle" fill="#fff">250×550</text>')
    a(f'<text x="{X(c["x"]+c["w"]/2)}" y="{Y(c["y"])-12}" font-size="12" text-anchor="middle" fill="#fff">無障礙兼電動車位</text>')
for m in L['moto']:
    stall(m, '#3d7fc4' if m.get('acc') else '#ffffff')
    cx, cy = X(m['x']+m['w']/2), Y(m['y']+m['d']/2)
    if m.get('acc'): chair(cx+40, cy, 56); cx -= 45
    a(f'<text x="{cx}" y="{cy+2}" font-size="20" font-weight="700" text-anchor="middle" fill="#fff">{m["n"]}</text>')
    if m.get("own"): a(f'<text x="{cx}" y="{cy-26}" font-size="13" font-weight="700" text-anchor="middle" fill="#f2c230">自設</text>')
    a(f'<text x="{cx}" y="{cy+20}" font-size="12" text-anchor="middle" fill="#fff">{int(m["w"]*100)}×{int(m["d"]*100)}</text>')
for p in L['pillars']:
    a(f'<rect x="{X(p["x"])}" y="{Y(p["y"]+p["s"])}" width="{p["s"]*S}" height="{p["s"]*S}" fill="#4a4b50" stroke="#2a2b2e" stroke-width="2"/>')
    a(f'<text x="{X(p["x"]+p["s"]/2)}" y="{Y(p["y"]+p["s"]/2)+5}" font-size="12" text-anchor="middle" fill="#fff">柱</text>')
pl = L['planters']
a(f'<rect x="{X(pl["x"])}" y="{Y(pl["y"]+pl["d"])}" width="{pl["w"]*S}" height="{pl["d"]*S}" fill="#232325"/>')
for k in range(9): a(f'<circle cx="{X(pl["x"]+pl["w"]/2)}" cy="{Y(pl["y"]+.5+k*.85)}" r="13" fill="#4f7d3a"/>')
a(f'<text x="{X(W)+22}" y="{Y(D/2)}" font-size="13" text-anchor="middle" fill="#3b2a1a" transform="rotate(90 {X(W)+22} {Y(D/2)})">東側植栽箱（羅漢松）→ 中北三街176巷</text>')
# 北方箭頭
a(f'<g transform="translate({TW-50},110)"><polygon points="0,-18 9,10 0,4 -9,10" fill="#3b2a1a"/><text y="30" font-size="14" text-anchor="middle" fill="#3b2a1a">北</text></g>')
# 圖例
ly = TH-30
a(f'<text x="{PADX}" y="{ly-22}" font-size="14" fill="#3b2a1a">汽車位 2 格（22、23 無障礙兼電動車位）＋斜線下車區；機車位 18 格（4、5 無障礙 225×200；1–3、8–15 為 100×200；6、7、16–18 為 75×175）。</text>')
a(f'<text x="{PADX}" y="{ly}" font-size="14" fill="#3b2a1a">藍線＝無障礙車位，白線＝一般車位；車頭朝南（中北三街）停放。</text>')
a('</svg>')
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '1f-rear-parking.svg'),'w').write('\n'.join(o))
print(TW, TH)
