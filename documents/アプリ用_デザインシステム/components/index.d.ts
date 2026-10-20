import type * as React from 'react';
/** Primary for the one main action on a screen (冒険に出る / 答える); secondary for the rest; quiet for inline links. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'quiet'; size?: 'md' | 'sm'; block?: boolean }
export declare function Button(props: ButtonProps): React.ReactElement;
/** Level crest plus EXP progress toward the next level. */
export interface ExpBarProps { level: number; exp: number; next: number; gain?: number; title?: string }
export declare function ExpBar(props: ExpBarProps): React.ReactElement;
/** One daily quest. done is derived from current >= target unless set. */
export interface QuestCardProps { title: string; reward: number; current?: number; target?: number; done?: boolean }
export declare function QuestCard(props: QuestCardProps): React.ReactElement;
/** One option of a four-choice question. choiceKey is the kana label (ア/イ/ウ/エ). */
export interface ChoiceOptionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { choiceKey: string; state?: 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'; children?: React.ReactNode }
export declare function ChoiceOption(props: ChoiceOptionProps): React.ReactElement;
/** The AI partner speaking. thinking shows the grading wait animation instead of children. */
export interface PartnerBubbleProps { name: string; persona?: 'encourage' | 'logic' | 'rival'; sigil?: string; thinking?: boolean; children?: React.ReactNode }
export declare function PartnerBubble(props: PartnerBubbleProps): React.ReactElement;
/** 100-point keyword-explanation score with the pass line (default 60). children = the missing viewpoints note. */
export interface ScoreMeterProps { score: number; pass?: number; children?: React.ReactNode }
export declare function ScoreMeter(props: ScoreMeterProps): React.ReactElement;
/** Forgetting-curve stage: 0 unlearned, 1-5 the 1/3/7/14/30-day steps, 6 mastered. */
export interface ReviewStageProps { stage: 0 | 1 | 2 | 3 | 4 | 5 | 6; kind?: '択一' | '説明' }
export declare function ReviewStage(props: ReviewStageProps): React.ReactElement;
/** One row of the weekly course ranking. */
export interface RankingRowProps { rank: number; name: string; exp: number; level?: number; isMe?: boolean }
export declare function RankingRow(props: RankingRowProps): React.ReactElement;
/** Achievement badge. category picks the kanji emblem; tier the metal. */
export interface GuildBadgeProps { category: 'mastery' | 'coverage' | 'explain' | 'streak' | 'review'; title: string; tier?: 'bronze' | 'silver' | 'gold'; date?: string; locked?: boolean }
export declare function GuildBadge(props: GuildBadgeProps): React.ReactElement;
declare global { interface Window { Guild: { Button: typeof Button; ExpBar: typeof ExpBar; QuestCard: typeof QuestCard; ChoiceOption: typeof ChoiceOption; PartnerBubble: typeof PartnerBubble; ScoreMeter: typeof ScoreMeter; ReviewStage: typeof ReviewStage; RankingRow: typeof RankingRow; GuildBadge: typeof GuildBadge } } }
