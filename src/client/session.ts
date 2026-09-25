import type { NewGameInput, PlayerKind } from '../arena/types';
import type { BotConfig } from '../bots/config';
import { Game } from '../engine/game';
import type { Color, GameMode } from './types';

export interface Seat {
  kind: PlayerKind;
  /** Registered player id, or null for a guest (game not recorded). */
  playerId: string | null;
  name: string;
  avatar: string;
  rating?: number;
  bot?: BotConfig;
}

/** Glue between the rules engine and the players seated at the board. */
export class GameSession {
  readonly game = new Game();
  recorded = false;

  constructor(
    readonly white: Seat,
    readonly black: Seat,
  ) {}

  get mode(): GameMode {
    const bots = [this.white, this.black].filter((s) => s.kind === 'bot').length;
    return bots === 0 ? 'pvp' : bots === 2 ? 'eve' : 'pve';
  }

  seat(color: Color): Seat {
    return color === 'w' ? this.white : this.black;
  }

  get toMove(): Seat {
    return this.seat(this.game.turn);
  }

  isBotTurn(): boolean {
    return !this.game.status().over && this.toMove.kind === 'bot';
  }

  /** The game counts for the leaderboard only when both players are registered. */
  get recordable(): boolean {
    return this.white.playerId !== null && this.black.playerId !== null;
  }

  /** Undo is allowed in casual games only. Against a bot, the bot's reply is undone too. */
  canUndo(): boolean {
    return !this.recordable && this.game.history().length > 0 && this.mode !== 'eve';
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.game.undo();
    if (this.mode === 'pve' && this.toMove.kind === 'bot') this.game.undo();
  }

  /** Payload for the API once the game is over, or null if it must not be recorded. */
  resultPayload(): NewGameInput | null {
    const status = this.game.status();
    if (!status.over || !this.recordable || this.recorded) return null;
    return {
      whiteId: this.white.playerId!,
      blackId: this.black.playerId!,
      moves: this.game.history(),
      result: status.result as NewGameInput['result'],
      reason: status.reason!,
      mode: this.mode,
    };
  }
}
