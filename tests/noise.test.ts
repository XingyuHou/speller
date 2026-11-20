import { describe, expect, it } from 'vitest'
import { CONFIG, SOUND_CONFIG as rules } from '../src/config'
import { Player, type PlayerInput } from '../src/player/Player'
import { circleHears, landingRadius, NoiseSystem, touchesSpikes, type SoundLayout } from '../src/sound/NoiseSystem'
import { BehaviorTerrain } from '../src/world/behaviors/BehaviorTerrain'
import { CollisionMask } from '../src/world/CollisionMask'

const idle: PlayerInput = { left: false, right: false, jumpHeld: false, jumpPressed: false }
const run = { ...idle, right: true }
const dt = CONFIG.simulation.step
const half = CONFIG.physics.playerSize / 2

function scene() {
  const terrain = new BehaviorTerrain()
  const mask = new CollisionMask(1600, 1100)
  mask.addStroke([{x: 0, y: 604}, {x: 1600, y: 604}], 4)
  const nervous = terrain.add({id: 'n', behavior: 'nervous', role:'terrain', text:'NERVOUS', x:100, y:480, size:'L', seed:10, collectible:[0]})
  const door = terrain.add({id:'gate', behavior:'door',role:'terrain',text:'DOOR',x:1000,y:610,size:'L',seed:12,rotation:-Math.PI/2})
  mask.attachBehaviors(terrain)
  const layout: SoundLayout = {
    nervous:[{id:'n',hearZone:{x:90,y:385,width:250,height:50}}],
    spikes:[
      {id:'s', x:500, y:600, width:90, height:64, hearZone:{x:490,y:552,width:70,height:35}},
      {id:'clock-s',x:800,y:440,width:100,height:60,upsideDown:true},
      {id:'far',x:1400,y:440,width:70},
    ],
    metronomes:[{id:'clock',x:810,y:410,links:['clock-s','far']}],
    grandpa:{id:'grandpa',doorId:'gate',hearZone:{x:700,y:-500,width:650,height:1500}},
  }
  const noise = new NoiseSystem(layout,terrain)
  const player = new Player(mask,40,530)
  function step(input = idle, silent = false) {
    noise.preStep(dt, player, silent)
    terrain.tick(dt)
    player.step(dt,input)
    return noise.postStep(player)
  }
  return { terrain, mask, nervous, door, noise, player, step }
}

describe('sound sources and mechanisms', () => {
  it('uses a circle/rectangle intersection and the specified impact-speed curve', () => {
    const zone = {x:0,y:0,width:20,height:20}
    expect(circleHears(23,24,5,zone)).toBe(true)
    expect(circleHears(23,24,4.99,zone)).toBe(false)
    expect(circleHears(4,4,0,zone)).toBe(true)
    expect(landingRadius(-1)).toBe(rules.landBaseRadius)
    expect(landingRadius(450)).toBe(5*CONFIG.unit)
    expect(landingRadius(999)).toBe(7*CONFIG.unit)
  })

  it('emits actual jump and impact events once and spaces footsteps in world time', () => {
    const { player, noise, step } = scene()
    for (let i=0;i<100;i++) step()
    expect(player.grounded).toBe(true)
    expect(noise.events).toHaveLength(0)
    for (let i=0;i<45;i++) step(run)
    const footsteps = noise.events.filter(e=>e.kind==='step')
    expect(footsteps).toHaveLength(2)
    expect(footsteps[0].radius).toBe(rules.stepRadius)
    expect(footsteps[0].age - footsteps[1].age).toBeCloseTo(rules.stepPeriod, 1)
    step({...idle,jumpHeld:true,jumpPressed:true})
    expect(noise.events.filter(e=>e.kind==='jump')).toHaveLength(1)
    for (let i=0;i<120 && !player.grounded;i++) step({...idle,jumpHeld:true})
    expect(noise.events.filter(e=>e.kind==='land')).toHaveLength(1)
    expect(noise.events.find(e=>e.kind==='land')!.radius).toBeGreaterThan(rules.jumpRadius)
  })

  it('preserves the actual landing sound and takeoff sound of BOUNCY', () => {
    const { terrain, noise, player, step } = scene()
    const bounce = terrain.add({id:'b',behavior:'bouncy',role:'terrain',x:400,y:410,text:'BOUNCY',size:'L',seed:9})
    player.reset(bounce.bodies[0].anchorX,bounce.bodies[0].box.minY-110)
    for(let i=0;i<100 && player.vy>=0;i++)step()
    expect(noise.events.map(e=>e.kind)).toEqual(['land','jump'])
    expect(noise.events[0].radius).toBeGreaterThan(rules.jumpRadius)
  })

  it('shakes the entire nervous word, drops it, restores the actual pickup and collision', () => {
    const { player, noise, nervous, mask, step } = scene()
    const n=nervous.bodies[0]
    const originalTop=n.box.minY
    player.reset(n.anchorX,originalTop-half-25)
    for(let i=0;i<70 && noise.nervous[0].age===null;i++) step()
    expect(noise.nervous[0].age).toBe(0)
    noise.preStep(0.05,player,false)
    expect(nervous.getTransform().x).not.toBe(0)
    expect(nervous.bodies.every(b=>b.motion===nervous.getTransform())).toBe(true)
    nervous.setAppearance({collected:new Set([0])})
    expect(n.inkColor()).toBe(CONFIG.colors.collected)
    noise.preStep(rules.nervousShake,player,false)
    expect(nervous.getTransform().available).toBe(false)
    expect(mask.landingTop(n.anchorX-1,n.anchorX+1,originalTop,originalTop)).toBeNull()
    noise.preStep(rules.nervousRespawn,player,false)
    expect(nervous.getTransform().available).toBe(true)
    expect(mask.landingTop(n.anchorX-1,n.anchorX+1,originalTop,originalTop)).toBe(originalTop)
    expect(n.inkColor()).toBe(CONFIG.colors.collected)
  })

  it('keeps the clock on under SILENT and triggers only its linked in-range spikes', () => {
    const { noise, player, step } = scene()
    player.reset(810,530)
    for(let i=0;i<Math.ceil((rules.clockPeriod+rules.spikeExtend+dt)/dt);i++) step(run,true)
    expect(noise.events.some(e=>e.kind==='pulse')).toBe(true)
    expect(noise.events.some(e=>e.source==='player')).toBe(false)
    expect(noise.spikes.map(s=>s.extension)).toEqual([0,1,0])
    expect(noise.grandpa?.awake).toBe(false)
    expect(noise.nervous[0].age).toBeNull()
    noise.preStep(rules.spikeHold+dt,player,true)
    expect(noise.spikes[1].age).toBeNull()
  })

  it('extends gradually, ignores retriggers while active, and tests the same ceiling teeth as the drawing', () => {
    const { noise, player } = scene()
    const spike=noise.spikes[0]
    function emit() {
      player.motionEvents.length=0
      player.motionEvents.push({kind:'jump',x:500,y:550,impactSpeed:0})
      noise.postStep(player)
    }
    emit()
    expect(spike.extension).toBe(0)
    noise.preStep(rules.spikeExtend/2,player,false)
    expect(spike.extension).toBeCloseTo(.5)
    emit()
    expect(spike.age).toBeCloseTo(rules.spikeExtend/2)
    noise.preStep(rules.spikeExtend/2,player,false)
    expect(spike.extension).toBe(1)
    const upside={...spike,upsideDown:true,width:rules.spikeToothWidth}
    expect(touchesSpikes(upside,upside.x+upside.width/2,upside.y+upside.height-1,1)).toBe(true)
    expect(touchesSpikes(upside,upside.x+1,upside.y+upside.height-1,1)).toBe(false)
    noise.preStep(rules.spikeHold+dt,player,false)
    expect(spike.age).toBeNull()
    emit()
    expect(spike.age).toBe(0)
  })

  it('closes the gate for three seconds after the last player sound, even when the clock keeps ticking', () => {
    const {noise,player}=scene()
    noise.preStep(dt,player,false)
    player.motionEvents.push({kind:'land',x:800,y:450,impactSpeed:500})
    noise.postStep(player)
    expect(noise.grandpa?.remaining).toBe(rules.grandpaSleep)
    noise.preStep(2,player,false)
    player.motionEvents.length=0
    player.motionEvents.push({kind:'jump',x:800,y:450,impactSpeed:0})
    noise.postStep(player)
    noise.preStep(rules.grandpaSleep-dt,player,true)
    expect(noise.grandpa?.awake).toBe(true)
    noise.preStep(dt*2,player,true)
    expect(noise.grandpa?.awake).toBe(false)
  })

  it('stops quiet-timing and aerial gate bypasses, and lets an admitted square leave safely on expiry', () => {
    const {noise,door,player}=scene()
    const west=door.bounds.minX-half
    const east=door.bounds.maxX+half
    for(const y of [580,-300]){
      noise.reset()
      player.reset(west-1,y)
      noise.preStep(dt,player,false)
      player.x=west+2
      expect(noise.postStep(player)).toBe(false)
      expect(player.x).toBe(west)
    }
    noise.reset()
    player.reset(west-1,540)
    noise.preStep(dt,player,true)
    player.x=west+1
    expect(noise.postStep(player)).toBe(false)
    noise.preStep(dt,player,false)
    expect(noise.grandpa?.awake).toBe(true)
    player.x=east+1
    expect(noise.postStep(player)).toBe(false)
    expect(player.x).toBeGreaterThan(east)
    noise.reset()
    expect(noise.grandpa?.awake).toBe(false)
    expect(noise.events).toHaveLength(0)
  })
})
