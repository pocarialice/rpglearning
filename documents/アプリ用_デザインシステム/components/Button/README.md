# Button

ギルドの操作ボタン。`primary` は封蝋色の `crimson` で、1画面に1つだけ置く主要アクション（「冒険に出る」「答える」「採点してもらう」）に使う。

- 消費側が渡すもの：`children`（動詞で終わる短いラベル）、`variant`（`primary` / `secondary` / `quiet`）、`size`（`md` 44px / `sm` 36px）、`block`（スマホで横幅いっぱい）、通常の button 属性。
- スマホの主要ボタンは `block` かつ `md`。指で押せる高さ44pxを下回らせない。
- `secondary` は `line-strong` の枠で、コース選択や「あとで」など。`quiet` は `teal` の下線リンクで、解説を開くなど文中の操作に。
- 押下中は `shadow-press` で封蝋を押したように沈む。フォーカスは `teal` の3pxリング。
- しないこと：プライマリを並べる、ラベルに絵文字を入れる、「OK」「はい」だけのラベル。

<p></p>
