# QuestCard

デイリークエスト1件を、ギルドの掲示板に貼られた依頼書として見せるカード。ホームでは3件を縦に並べる。

- 消費側が渡すもの：`title`（「〜する」で終わる依頼文）、`reward`（EXP）、`current` と `target`。`done` は省略すると `current >= target` で決まる。
- 枠は `gd-card` の二重線（`line`）。未達成は `gold` の細いバーで進み具合、達成は `crimson-soft` の地に `crimson` の「達成」スタンプ。
- 報酬は `gold-ink` で「報酬 30 EXP」と書く。
- しないこと：未達成を警告色にする（ペナルティは無い仕様）、依頼文を2行以上にする。

<p></p>
