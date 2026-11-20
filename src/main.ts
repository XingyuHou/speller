import Phaser from 'phaser'
import { CONFIG } from './config'
import { UI } from './content/lines'
import { PracticeScene } from './PracticeScene'
import { CourseShell } from './ui/CourseShell'
import { COURSE } from './level/course'
import { CHAPTER1 } from './level/level1'
import { SPELL_PRACTICE } from './level/spellPractice'
import './style.css'

const route = new URLSearchParams(location.search).get('course')
const courses = {
  practice: { data: COURSE, name: UI.course, complete: UI.complete },
  spells: { data: SPELL_PRACTICE, name: UI.lab, complete: UI.complete },
  chapter: { data: CHAPTER1, name: UI.chapter, complete: UI.chapterComplete },
}
const { data: course, name, complete } = route === 'practice' || route === 'spells' ? courses[route] : courses.chapter
const scene = new PracticeScene(course)
const root = document.querySelector<HTMLElement>('#app')!
scene.shell = new CourseShell(root, scene.controls, { stations: course.stations, sectionCount: scene.course.sectionStarts?.length, name, complete })
document.title = UI.title + ' · ' + name
export const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: scene.shell.mount,
  width: CONFIG.view.width,
  height: CONFIG.view.height,
  backgroundColor: CONFIG.colors.void,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  fps: { smoothStep: false },
  audio: { noAudio: true },
  banner: false,
  scene,
})
