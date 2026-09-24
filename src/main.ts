import Phaser from "phaser";
import "./styles.css";
import { GameScene } from "./scenes/GameScene.ts";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#000000",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540
  },
  pixelArt: true,
  scene: [GameScene]
};

new Phaser.Game(config);
