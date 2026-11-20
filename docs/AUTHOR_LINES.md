# Speller — 作者文案审批表

> 游戏里所有面向玩家的作者文案，都以本表为准（见 DEMO_SPEC §0.1）。
> **作者审批方式**：直接修改"文案"列，并把"状态"改为 `已批准` / `已修改` / `已删除`。
> Codex 不得自行修改本表中的文案；需要新文案时，在末尾追加 `待写` 条目。

状态说明：`待审` 占位文案，等作者审批 · `已批准` 可以直接使用 · `已修改` 作者已改写，使用新文本 · `已删除` 不显示 · `待写` 需要作者提供

---

## A. 作者原创提示句（来自原始设计，默认已批准）

| ID | 位置 | 文案 | 状态 |
|---|---|---|---|
| H01 | 第 1 段 提示句桥（PALM 为浅蓝） | TOO DARK TO SEE ANYTHING? THE LIGHT LIES WITHIN THE PALM OF YOUR HAND. | 已批准 |
| H02 | 第 4b 段 入口提示句桥 | SOMETIMES YOU NEED TO LISTEN BEFORE YOU MOVE. | 已批准 |
| H03 | 第 5 段 起跑前提示句 | KNOWING WHEN TO LISTEN IS USEFUL. KNOWING WHEN TO BE SILENT IS BETTER. | 已批准 |

## B. 幽默地形文字（白色，可站立）

| ID | 节拍 | 文案 | 状态 |
|---|---|---|---|
| T01 | 0.1 出生点 | HERE | 待审 |
| T02 | 0.4 致死坑两侧 | MIND THE / GAP | 待审 |
| T03 | 0.8 坑边句子 | DON'T FALL. | 待审 |
| T04 | 1 黑暗地面 | SOME FLOOR / MORE FLOOR / STILL FLOOR | 待审 |
| T05 | 2.4 弧形长句桥 | THIS SENTENCE IS UNNECESSARILY LONG BECAUSE THE GAP IS UNNECESSARILY WIDE. | 待审 |
| T06 | 2.5 问号坡道 | WHERE AM I GOING? | 待审 |
| T07 | 2.6 黑暗结束落点 | FINALLY | 待审 |
| T08 | 3 台阶 | LEDGE | 待审 |
| T09 | 4a.1 浅坑底部 | DOWNSTAIRS | 待审 |
| T10 | 4b.3 奖励路线 | TIPTOE | 待审 |

> 功能性单词（PLATFORM、STEP、BOUNCY、CRUMBLY、NERVOUS、TICK TOCK、DOOR、GRANDPA、SAVE、NEXT，以及承载字母的 HELLO、HI、SHHH、LEAP）属于玩法设计，已在规格中确定。如需更换，也请在这里注明。

## C. 灰色批注（关卡中）

| ID | 节拍 | 文案 | 状态 |
|---|---|---|---|
| N01 | 0.1 出生点 | You are here. Obviously. | 待审 |
| N02 | 0.2 PLATFORM 上方 | Yes, you can stand on words. Don't make it weird. | 待审 |
| N03 | 0.4 坑底 | told you. | 待审 |
| N04 | 0.5 省略号 | Pause for dramatic effect. | 待审 |
| N05 | 0.6 高墙上 | Too high? Read the floor. | 待审 |
| N06 | 0.7 CRUMBLY 桥 | Keep moving. Seriously. | 待审 |
| N07 | 1 PALM 旁（教学） | Light blue words can be rearranged. Drag the letters up there. SPACE to cast. | 待审 |
| N08 | 2.2 I 柱 | I, I, I. It's all about me. | 待审 |
| N09 | 2.6 台灯离开 | Thanks, LAMP. You're free now. | 待审 |
| N10 | 3 HELLO 旁（教学） | Yellow letters can be taken. Press S. (They stay. We're not thieves.) | 待审 |
| N11 | 3 首次收集后，拼词栏旁 | Collected letters stay up here. Shuffle them anytime. | 待审 |
| N12 | 4a SHHH 旁 | Quiet area. Mostly. | 待审 |
| N13 | 4a.1 NERVOUS | They get nervous when you land loudly. | 待审 |
| N14 | 4a.3 节拍器 | It's not you. It's the clock. (Sometimes it's you.) | 待审 |
| N15 | 4a 出口（字母不足 6 个时） | Missing something? Six letters. Count them. | 待审 |
| N16 | 通关画面 | More words coming. Probably. | 待审 |

## D. 角色台词

| ID | 位置 | 文案 | 状态 |
|---|---|---|---|
| C01 | GRANDPA 醒来 | WHO'S THERE?! | 待审 |
| C02 | GRANDPA 睡着 | Z z z | 待审 |

## E. 施法反馈

| ID | 触发 | 文案 | 状态 |
|---|---|---|---|
| S01 | 在生效区域外施法 | Not here. Not now. | 待审 |
| S02 | SILENT 冷却中再次提交 | Shh. Still recharging. | 待审 |

## F. 彩蛋台词

| ID | 输入 | 文案 | 状态 |
|---|---|---|---|
| E01 | PALM（未改动） | That's just your hand. | 待审 |
| E02 | TINSEL | Wrong season. | 待审 |
| E03 | ENLIST | He'll be back. (He won't.) | 待审 |
| E04 | INLETS | Technically correct. Useless, but correct. | 待审 |
| E05 | LIST | Organized. I like that. | 待审 |
| E06 | TEN | Generous. | 待审 |
| E07 | NET | Caught you. | 待审 |

### F1. LIST 清单中的字母位置提示

| ID | 字母 | 文案 | 状态 |
|---|---|---|---|
| L01 | L | L: someone's saying hello | 待审 |
| L02 | I | I: up high, saying hi | 待审 |
| L03 | S | S: where it's quiet | 待审 |
| L04 | N | N: somewhere nervous | 待审 |
| L05 | E | E: take a leap | 待审 |
| L06 | T | T: ask the clock | 待审 |

## G. 兜底吐槽池（乱拼时随机显示）

| ID | 文案 | 状态 |
|---|---|---|
| F01 | That's not a word. I checked. | 待审 |
| F02 | Bless you. | 待审 |
| F03 | Even I can't read that. | 待审 |
| F04 | Close. Not really. | 待审 |
| F05 | Is that a password? | 待审 |

## H. 死亡吐槽（每个检查点区间第 3 次死亡时显示）

| ID | 区间 | 文案 | 状态 |
|---|---|---|---|
| D01 | 第 0 段 | You again? | 待审 |
| D02 | 第 0 段 | The floor is right there. | 待审 |
| D03 | 第 1 段 | — | 待写 |
| D04 | 第 2 段 | — | 待写 |
| D05 | 第 3 段 | （本段无危险，可不需要） | 待写 |
| D06 | 第 4a 段 | — | 待写 |
| D07 | 第 4b 段 | — | 待写 |
| D08 | 第 5 段 | — | 待写 |
| D09 | 第 6 次死亡生成逗号台阶时 | Fine. Here's a comma. | 待审 |

---

## 新增文案申请（Codex 追加区）

| ID | 位置 / 用途 | 建议文案 | 状态 |
|---|---|---|---|
| E08 | 彩蛋：未改动直接提交 `WORDS` 时的吐槽 | — | 待写 |
