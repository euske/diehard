/// <reference path="../lib/d3.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="geom.ts" />


/// There's some good read at
/// http://electronics.stackexchange.com/questions/122050/what-limits-cpu-speed

type d3object = d3.Selection<any>;

function d3this() {
    return d3.select(this);
}

interface SoundAsset {
    [index: string]: HTMLAudioElement;
}

let SOUNDS: SoundAsset = {};

const DIRS = [ new Vec2(-1,0), new Vec2(0,-1), new Vec2(0,+1), new Vec2(+1,0) ];


//  Cell
//
class Cell {

    cost = Infinity;
    dir: Vec2 = null;
    cpt: Component = null;

    toString() {
	return ('<Cell: cost='+this.cost+', dir='+this.dir+', cpt='+this.cpt+'>');
    }
}

//  Entry
//
class Entry {
    
    p: Vec2;
    cost: number;
    total: number;
    
    constructor(p: Vec2, cost=0, total=0) {
	this.p = p;
	this.cost = cost;
	this.total = total;
    }

    toString() {
	return ('<Entry: p='+this.p+', cost='+this.cost+', total='+this.total+'>');
    }
}

//  Map
//
class Map {

    width: number;
    height: number;
    _a: Cell[][];

    constructor(width: number, height: number) {
	this.width = width;
	this.height = height;
	this._a = range(height).map((y:number) => {
	    return range(width).map((x:number) => { return new Cell(); });
	});
    }

    debug() {
	for (let row of this._a) {
	    let s = "";
	    for (let cell of row) {
		s += (cell.cpt !== null)? "1" : "0";
	    }
	    log(s);
	}
    }

    clearCpt() {
	for (let row of this._a) {
	    for (let cell of row) {
		cell.cpt = null;
	    }
	}
    }

    setCpt(rect: Rect, cpt: Component=null) {
	for (let dy = 0; dy < rect.height; dy++) {
	    let y = rect.y+dy;
	    if (y < 0 || this.height <= y) continue;
	    let row = this._a[y];
	    for (let dx = 0; dx < rect.width; dx++) {
		let x = rect.x+dx;
		if (x < 0 || this.width <= x) continue;
		row[x].cpt = cpt;
	    }
	}
    }

    getPath(p0: Vec2, p1: Vec2): Vec2[] {
	if (p0.x < 0 || p0.y < 0 || this.width <= p0.x || this.height <= p0.y) return null;
	if (p1.x < 0 || p1.y < 0 || this.width <= p1.x || this.height <= p1.y) return null;
	
	for (let row of this._a) {
	    for (let cell of row) {
		cell.cost = Infinity;
		cell.dir = null;
	    }
	}
	
	this._a[p0.y][p0.x].cost = 0;
	let q = [new Entry(p0)];
	while (true) {
	    if (q.length == 0) return null;
	    let e = q.shift();
	    let p = e.p;
	    if (p.equals(p1)) break;
	    let cost = e.cost + 1;
	    for (let dir of DIRS) {
		let pp = p.add(dir);
		if (pp.y < 0 || pp.x < 0 || this.width <= pp.x || this.height <= pp.y) continue;
		let row = this._a[pp.y];
		let cell = row[pp.x];
		if (cell.cpt !== null && !pp.equals(p1)) continue;
		if (cost < cell.cost) {
		    cell.cost = cost;
		    cell.dir = dir;
		    let dist = Math.abs(p1.x-pp.x) + Math.abs(p1.y-pp.y);
		    q.push(new Entry(pp, cost, cost+dist));
		}
	    }
	    q.sort((a:Entry,b:Entry) => { return a.total-b.total; });
	}

	let path = [] as Vec2[];
	while (true) {
	    path.push(p1);
	    if (p1.equals(p0)) break;
	    let cell = this._a[p1.y][p1.x];
	    p1 = p1.sub(cell.dir);
	}
	return path;
    }
}


//  Connector
//
class Connector {

    parent: Component;
    pos: Vec2;
    link: Link = null;

    pin: d3object = null;
    
    constructor(parent: Component, pos: Vec2=null) {
	this.parent = parent;
	this.pos = pos;
    }

    show() {
	assert (this.pin === null);
	this.pin = this.parent.group.append('circle');
	this.pin.attr('r', 4);
	this.pin.attr('stroke', 'none');
	this.update();
    }

    hide() {
	assert (this.pin !== null);
	this.pin.remove();
	this.pin = null;
    }

    update() {
	if (this.pos !== null) {
	    let ts = this.parent.canvas.tilesize;
	    this.pin.attr('cx', this.pos.x*ts);
	    this.pin.attr('cy', this.pos.y*ts);
	}
	let linked = true;
	for (let link of this.parent.canvas.findLinks(this)) {
	    if (!link.isLinked()) {
		linked = false;
		break;
	    }
	}
	this.pin.attr('fill', linked? '#0f0' : 'red');
    }
    
    getPos() {
	if (this.pos !== null) {
	    return this.parent.getPos(this.pos);
	} else {
	    return null;
	}
    }
}


//  Link
//
class Link {
    
    canvas: Canvas;
    conn0: Connector;
    conn1: Connector;
    color: string;
    path: Vec2[] = null;

    lines: d3object = null;
    _annot: d3object = null;
    
    constructor(canvas: Canvas, conn0: Connector, conn1: Connector, color='#0f0') {
	this.canvas = canvas;
	this.conn0 = conn0;
	this.conn1 = conn1;
	this.color = color;
	// XXX 1-to-many link is possible. Each connector might have mutliple links.
	if (conn0.link === null) {
	    conn0.link = this;
	}
	if (conn1.link === null) {
	    conn1.link = this;
	}
    }

    show() {
	assert (this.lines === null);
	this.lines = this.canvas.svg.append('polyline');
	this.lines.on('mouseenter', () => { this.setFocus(true); });
	this.lines.on('mouseleave', () => { this.setFocus(false); });
	this.lines.attr('stroke-width', 4);
	this.lines.attr('fill', 'none');
	this.lines.attr('stroke', this.color);
    }

    hide() {
	assert (this.lines !== null);
	this.lines.remove();
	this.lines = null;
    }

    setFocus(focus: boolean) {
	if (focus) {
	    if (this.path !== null) {
		let annot = this.canvas.svg.append('g');
		for (let i = 0; i < this.path.length; i += 4) {
		    let p = this.path[i];
		    let dot = annot.append('circle');
		    p = this.canvas.grid2vec(p);
		    dot.attr('cx', p.x);
		    dot.attr('cy', p.y);
		    dot.attr('r', 2);
		    dot.attr('stroke', 'none');
		    dot.attr('fill', 'black');
		}
		this._annot = annot;
	    }
	    this.lines.attr('stroke', 'yellow');
	} else if (this._annot !== null) {
	    this._annot.remove();
	    this.lines.attr('stroke', this.color);
	}
    }

    isLinked() {
	return (this.path !== null);
    }

    getPathLen() {
	return (this.path === null)? 0 : this.path.length;
    }
    
    update() {
	let pos0 = this.conn0.getPos();
	let pos1 = this.conn1.getPos();
	if (pos0 !== null && pos1 !== null) {
	    this.path = this.canvas.map.getPath(pos0, pos1);
	    let points = [] as String[];
	    if (this.path !== null) {
		for (let p of this.path) {
		    p = this.canvas.grid2vec(p);
		    points.push(p.str());
		}
	    }
	    this.lines.attr('points', points.join(' '));
	}
    }
}


//  Component
//
class Component {

    canvas: Canvas;
    title: string;
    center: Vec2;
    hsize: number = 0;
    vsize: number = 0;
    connectors: Connector[] = [];

    svg: d3object;
    group: d3object = null;
    text: d3object = null;
    
    delta: Vec2 = null;
    focus: boolean = false;
    rot: number = 0;
    collision: boolean = false;

    constructor(canvas: Canvas, title: string, center: Vec2) {
	this.canvas = canvas;
	this.svg = canvas.svg;
	this.title = title;
	this.center = center;
    }

    show() {
	assert (this.group === null);
	this.group = this.svg.append('g');
	this.group.on('mouseenter', () => { this.setFocus(true); });
	this.group.on('mouseleave', () => { this.setFocus(false); });
	this.showShape();
	this.text = this.group.append('text');
	this.text.attr('x', 0);
	this.text.attr('y', 0);
	this.text.attr('stroke', 'none');
	this.text.attr('text-anchor', 'middle');
	this.text.attr('fill', 'black');
	this.text.text(this.title);
	for (let ctr of this.connectors) {
	    ctr.show();
	}
	this.update();
    }

    hide() {
	assert (this.group !== null);
	for (let ctr of this.connectors) {
	    ctr.hide();
	}
	this.hideShape();
	this.group.remove();
	this.group = null;
    }

    rotate() {
	this.rot = (this.rot+1) % 4;
    }

    setFocus(focus: boolean) {
	this.focus = focus;
	this.update();
    }

    dragStart() {
	this.delta = null;
    }

    dragMove(delta: Vec2) {
	this.delta = this.canvas.vec2grid(delta);
    }

    dragEnd() {
	this.setCenter(this.center.add(this.delta));
	this.delta = null;
    }

    setCenter(center: Vec2) {
	this.center = center;
    }

    setSize(hsize: number, vsize: number) {
	this.hsize = hsize;
	this.vsize = vsize;
	this.resizeShape();
    }

    getCenter(): Vec2 {
	if (this.delta !== null) {
	    return this.center.add(this.delta);
	} else {
	    return this.center;
	}
    }

    getBounds(): Rect {
	let center = this.getCenter();
	if ((this.rot % 2) == 0) {
	    return new Rect(
		center.x-this.hsize, center.y-this.vsize,
		this.hsize*2+1, this.vsize*2+1);
	} else {
	    return new Rect(
		center.x-this.vsize, center.y-this.hsize,
		this.vsize*2+1, this.hsize*2+1);
	}
    }

    getPos(v: Vec2): Vec2 {
	let center = this.getCenter();
	return center.add(v.rot90(this.rot));
    }

    isOutOfDie() {
	let bounds = this.getBounds();
	return (bounds.x < 0 || bounds.y < 0 ||
		this.canvas.map.width <= bounds.right() ||
		this.canvas.map.height <= bounds.bottom());
    }

    showShape() {
    }

    hideShape() {
    }

    resizeShape() {
    }

    getShapeColor(): string {
	if (this.collision) {
	    return 'red';
	} else if (this.canvas.selection === this) {
	    return (this.focus)? '#8ff' : '#0ff';
	} else if (this.focus) {
	    return '#ff8';
	} else {
	    return 'white';
	}
    }
    
    update() {
	if (this.group !== null) {
	    let center = this.canvas.grid2vec(this.getCenter());
	    let s = 'translate('+center.x+','+center.y+')';
	    if (this.rot != 0) {
		s += ', rotate('+(90*this.rot)+')';
	    }
	    this.group.attr('transform', s);
	}
	for (let ctr of this.connectors) {
	    ctr.update();
	}
    }

    getDelay() {
	return 0;
    }

    getPower() {
	return 0;
    }

    getPrice() {
	return 0;
    }
}


//  RectComponent
// 
class RectComponent extends Component {

    shape: d3object = null;

    showShape() {
	assert (this.shape === null);
	this.shape = this.group.append('rect');
	this.shape.attr('stroke-width', '2');
	this.shape.attr('stroke', 'black');
    }

    hideShape() {
	assert (this.shape !== null);
	this.shape.remove();
	this.shape = null;
    }
    
    update() {
	super.update();
	if (this.shape !== null) {
	    let ts = this.canvas.tilesize;
	    let width = (this.hsize*2+1) * ts;
	    let height = (this.vsize*2+1) * ts;
	    this.shape.attr('x', -width/2);
	    this.shape.attr('y', -height/2);
	    this.shape.attr('width', width);
	    this.shape.attr('height', height);
	    this.shape.attr('fill', this.getShapeColor());
	}
    }
}


//  ClockComponent
// 
class ClockComponent extends RectComponent {

    clock_out: Connector;

    constructor(canvas: Canvas, center: Vec2) {
	super(canvas, 'Clock', center);
	this.clock_out = new Connector(this);
	this.connectors = [ this.clock_out ];
	this.setSize(3, 2);
    }

    resizeShape() {
	this.clock_out.pos = new Vec2(0, this.vsize);
    }
}


//  ControlComponent
// 
class ControlComponent extends RectComponent {

    nregs: number = 0;
    clock_in: Connector;
    ctrl_reg: Connector;
    ctrl_alu: Connector[] = [];
    
    constructor(canvas: Canvas, center: Vec2) {
	super(canvas, 'Control', center);
	this.clock_in = new Connector(this);
	this.ctrl_reg = new Connector(this);
	this.connectors = [
	    this.clock_in, this.ctrl_reg, 
	];
    }

    addALU() {
	let ctrl = new Connector(this);
	this.ctrl_alu.push(ctrl);
	this.connectors.push(ctrl);
	this.updateSize();
	ctrl.show();
    }

    delALU() {
	assert (1 <= this.ctrl_alu.length);
	let ctrl = this.ctrl_alu.pop();
	ctrl.hide();
	this.connectors.pop();
	this.updateSize();
    }

    setNumRegs(nregs: number) {
	this.nregs = nregs;
	this.updateSize();
    }

    updateSize() {
	this.setSize(this.nregs*3+10, this.ctrl_alu.length*3+2);
    }

    resizeShape() {
	this.clock_in.pos = new Vec2(-this.hsize, 0);
	this.ctrl_reg.pos = new Vec2(-this.hsize+2, this.vsize);
	for (let i = 0; i < this.ctrl_alu.length; i++) {
	    let x = int(((i+1)*this.hsize*2)/(this.ctrl_alu.length+1));
	    this.ctrl_alu[i].pos = new Vec2(-this.hsize+4+x, this.vsize);
	}
    }

    getDelay() {
	// XXX proportional to the number of registers.
	return this.nregs+5;
    }

    getPower() {
	// XXX proportional to the number of ALUs (makes no sense).
	return this.ctrl_alu.length*5;
    }

    getPrice() {
	// XXX proportional to the number of transistors.
	return (this.nregs * this.ctrl_alu.length)+10;
    }
}


//  RegisterComponent
// 
class RegisterComponent extends RectComponent {

    datawidth: number = 0;
    nregs: number = 0;
    ctrl_in: Connector;
    reg_in: Connector;
    reg_out: Connector;
    
    constructor(canvas: Canvas, center: Vec2) {
	super(canvas, 'Register', center);
	this.ctrl_in = new Connector(this);
	this.reg_in = new Connector(this);
	this.reg_out = new Connector(this);
	this.connectors = [
	    this.ctrl_in, this.reg_in, this.reg_out
	];
    }

    setNumRegs(datawidth: number, nregs: number) {
	this.datawidth = datawidth;
	this.nregs = nregs;
	this.setSize(datawidth+4, nregs*2+1);
    }

    resizeShape() {
	this.ctrl_in.pos = new Vec2(-this.hsize, 0);
	this.reg_in.pos = new Vec2(0, -this.vsize);
	this.reg_out.pos = new Vec2(0, this.vsize);
    }

    getDelay() {
	// XXX proportional to the number of registers and data width.
	return this.nregs*2+this.datawidth;
    }

    getPower() {
	// XXX proportional to the number of transistors.
	return (this.nregs * this.datawidth)+10;
    }

    getPrice() {
	// XXX proportional to the number of transistors.
	return (this.nregs * this.datawidth)+10;
    }
}

    
//  ALUComponent
// 
class ALUComponent extends Component {

    shape: d3object = null;

    datawidth: number = 0;
    ctrl_in: Connector;
    reg1_in: Connector;
    reg2_in: Connector;
    alu_out: Connector;
    
    constructor(canvas: Canvas, center: Vec2) {
	super(canvas, 'ALU', center);
	this.ctrl_in = new Connector(this);
	this.reg1_in = new Connector(this);
	this.reg2_in = new Connector(this);
	this.alu_out = new Connector(this);
	this.connectors = [
	    this.ctrl_in, this.reg1_in, this.reg2_in, this.alu_out,
	]
    }
    
    setDataWidth(datawidth: number) {
	this.datawidth = datawidth;
	this.setSize(datawidth*2+2, datawidth+2);
    }
    
    showShape() {
	assert (this.shape === null);
	this.shape = this.group.append('polygon');
	this.shape.attr('stroke-width', '2');
	this.shape.attr('stroke', 'black');
    }

    hideShape() {
	assert (this.shape !== null);
	this.shape.remove();
	this.shape = null;
    }
    
    resizeShape() {
	let x = 1+int(this.hsize/2);
	this.ctrl_in.pos = new Vec2(+this.hsize, 0);
	this.reg1_in.pos = new Vec2(-x, -this.vsize);
	this.reg2_in.pos = new Vec2(+x, -this.vsize);
	this.alu_out.pos = new Vec2(0, this.vsize);
    }
    
    update() {
	super.update();
	if (this.shape !== null) {
	    let ts = this.canvas.tilesize;
	    let width = (this.hsize*2+1) * ts;
	    let height = (this.vsize*2+1) * ts;
	    let points = [
		new Vec2(-width*0.5, -height*0.5).str(),
		new Vec2(-width*0.1, -height*0.5).str(),
		new Vec2(0, -height*0.3).str(),
		new Vec2(+width*0.1, -height*0.5).str(),
		new Vec2(+width*0.5, -height*0.5).str(),
		new Vec2(+width*0.3, +height*0.5).str(),
		new Vec2(-width*0.3, +height*0.5).str(),
	    ];
	    this.shape.attr('points', points.join(' '));
	    this.shape.attr('fill', this.getShapeColor());
	}
    }

    getDelay() {
	// XXX proportional to the data width.
	return this.datawidth*2;
    }

    getPower() {
	// XXX proportional to the data width.
	return this.datawidth*2;
    }

    getPrice() {
	// XXX proportional to the data width.
	return this.datawidth*10+10;
    }
}


//  Canvas
//
const DRAG_MIN = 4;
class Canvas {

    svg: d3object;
    map: Map;
    width: number;
    height: number;
    tilesize: number;

    datawidth = 0;
    nregs = 0;

    clock: ClockComponent = null;
    register: RegisterComponent = null;
    control: ControlComponent = null;
    alus: ALUComponent[] = [];
    components: Component[] = [];
    links: Link[] = [];
    
    selection: Component = null;
    
    _focused: Component = null;
    _start: Vec2 = null;
    _dragging = false;

    constructor(svg: d3object, tilesize: number) {
	this.svg = svg;
	this.width = parseInt(svg.attr('width'));
	this.height = parseInt(svg.attr('height'));
	this.tilesize = tilesize;
	this.map = new Map(int(this.width/tilesize), int(this.height/tilesize));
	
	this.svg.style('background', 'blue');
	this.svg.on('mousedown', () => { this.onMouseDown(d3.event as MouseEvent); });
	this.svg.on('mousemove', () => { this.onMouseMove(d3.event as MouseEvent); });
	this.svg.on('mouseup', () => { this.onMouseUp(d3.event as MouseEvent); });
	this.svg.on('mouseleave', () => { this.onMouseLeave(d3.event as MouseEvent); });
	this.svg.on('dblclick', () => { this.rotateSelection(); });

	let bg = this.svg.append('rect');
	bg.attr('x', 0);
	bg.attr('y', 0);
	bg.attr('width', this.width);
	bg.attr('height', this.height);
	bg.style('fill', 'url(#dots)');
    }
    
    init() {
	this.clock = new ClockComponent(this, new Vec2(5,4));
	this.addComponent(this.clock);
	
	this.control = new ControlComponent(this, new Vec2(30,10));
	this.addComponent(this.control);
	
	this.register = new RegisterComponent(this, new Vec2(30,25));
	this.addComponent(this.register);

	/// A control connects the resister and every ALU.
	/// Register connects the in/out of every ALU.
	this.addLink(new Link(this, this.clock.clock_out, this.control.clock_in, '#f0f'));
	this.addLink(new Link(this, this.control.ctrl_reg, this.register.ctrl_in, '#a00'));
	
	this.setDataWidth(8);
	this.setNumRegs(2);
	this.setNumALUs(1);
	this.update();
    }

    uninit() {
	for (let link of this.links) {
	    link.hide();
	}
	for (let cpt of this.components) {
	    cpt.hide();
	}
	this.datawidth = 0;
	this.nregs = 0;
	this.alus = [];
	this.components = [];
	this.links = [];
    }
    
    addALU() {
	let i = this.alus.length;
	let alu = new ALUComponent(this, new Vec2(30+i*2, 45+i));
	alu.setDataWidth(this.datawidth);
	this.alus.push(alu);
	this.addComponent(alu);
	this.control.addALU();
	this.addLink(new Link(this, this.control.ctrl_alu[i], alu.ctrl_in, '#a00'));
	this.addLink(new Link(this, this.register.reg_out, alu.reg1_in, '#0f0'));
	this.addLink(new Link(this, this.register.reg_out, alu.reg2_in, '#0f0'));
	this.addLink(new Link(this, alu.alu_out, this.register.reg_in, '#0cc'));
    }

    delALU() {
	let alu = this.alus.pop();
	this.control.delALU();
	this.removeComponent(alu);
	this.removeLink(alu.ctrl_in.link);
	this.removeLink(alu.reg1_in.link);
	this.removeLink(alu.reg2_in.link);
	this.removeLink(alu.alu_out.link);
    }

    setDataWidth(datawidth: number, sound=false) {
	datawidth = clamp(1, datawidth, 99);
	if (this.datawidth != datawidth) {
	    let elem = document.getElementById('f_dw') as HTMLInputElement;
	    elem.value = datawidth.toString();
	    if (sound) {
		playSound((this.datawidth < datawidth)? SOUNDS['add'] : SOUNDS['remove']);
	    }
	    this.datawidth = datawidth;
	    this.register.setNumRegs(this.datawidth, this.nregs);
	    for (let alu of this.alus) {
		alu.setDataWidth(this.datawidth);
	    }
	}
    }

    setNumRegs(nregs: number, sound=false) {
	nregs = clamp(1, nregs, 99);
	if (this.nregs != nregs) {
	    let elem = document.getElementById('f_reg') as HTMLInputElement;
	    elem.value = nregs.toString();
	    if (sound) {
		playSound((this.nregs < nregs)? SOUNDS['add'] : SOUNDS['remove']);
	    }
	    this.nregs = nregs;
	    this.control.setNumRegs(this.nregs);
	    this.register.setNumRegs(this.datawidth, this.nregs);
	}
    }

    setNumALUs(nalus: number, sound=false) {
	nalus = clamp(1, nalus, 99);
	if (this.alus.length != nalus) {
	    let elem = document.getElementById('f_alu') as HTMLInputElement;
	    elem.value = nalus.toString();
	    if (sound) {
		playSound((this.alus.length < nalus)? SOUNDS['add'] : SOUNDS['remove']);
	    }
	    while (this.alus.length != nalus) {
		if (this.alus.length < nalus) {
		    this.addALU();
		} else {
		    this.delALU();
		}
	    }
	}	
    }

    addComponent(cpt: Component) {
	this.components.push(cpt);
	cpt.show();
    }
    removeComponent(cpt: Component) {
	cpt.hide();
	removeElement(this.components, cpt);
    }

    addLink(link: Link) {
	this.links.push(link);
	link.show();
    }
    removeLink(link: Link) {
	link.hide();
	removeElement(this.links, link);
    }

    findLinks(conn: Connector) {
	let links = [];
	for (let link of this.links) {
	    if (link.conn0 === conn || link.conn1 === conn) {
		links.push(link);
	    }
	}
	return links;
    }

    update() {
	// called when any shape/position/configuration changed.
	let collision =this.updateCollisions();
	let linked = this.updateLinks();
	this.updateComponents();
	// calculate stuff.
	let f_clock = document.getElementById('f_clock');
	let f_power = document.getElementById('f_power');
	let f_price = document.getElementById('f_price');
	if (!collision && linked) {
	    let totalwire = this.links.reduce((total:number, link:Link) => {
		return total + link.getPathLen();
	    }, 0);
	    let maxwire = this.links.reduce((max:number, link:Link) => {
		return Math.max(max, link.getPathLen()); 
	    }, 0);
	    let cptdelay =
		(this.control.getDelay() +
		 this.register.getDelay() +
		 this.alus.reduce((total:number, cpt:Component) => {
		     return total + cpt.getDelay();
		 }, 0));
	    let cptpower = this.components.reduce((total:number, cpt:Component) => {
		return total + cpt.getPower();
	    }, 0);
	    let price = this.components.reduce((total:number, cpt:Component) => {
		return total + cpt.getPrice();
	    }, 0);
	    log("totalwire="+totalwire+
		", maxwire="+maxwire+
		", cptdelay="+cptdelay+
		", cptpower="+cptpower+
		", price="+price);

	    // XXX delay: transistor delay + wiring
	    let delay = (cptdelay + maxwire*0.2);
	    // XXX power: transistor power + wiring
	    let power = (cptpower + totalwire*0.2)*0.5;
	    
	    f_clock.innerText = (Math.round(1000/delay)*0.1)+'MHz';
	    f_power.innerText = (Math.round(power)*0.1)+'W';
	    f_price.innerText = '$'+price;
	} else {
	    f_clock.innerText = '---MHz';
	    f_power.innerText = '---W';
	    f_price.innerText = '$---';
	}
    }

    updateCollisions() {
	let collision = false;
	for (let cpt of this.components) {
	    cpt.collision = cpt.isOutOfDie();
	}
	for (let i = 0; i < this.components.length; i++) {
	    let cpt0 = this.components[i];
	    let bounds0 = cpt0.getBounds();
	    for (let j = i+1; j < this.components.length; j++) {
		let cpt1 = this.components[j];
		let bounds1 = cpt1.getBounds();
		if (bounds0.overlaps(bounds1)) {
		    cpt0.collision = true;
		    cpt1.collision = true;
		}
	    }
	    collision = collision || (cpt0.collision);
	}
	return collision;
    }

    updateLinks() {
	this.map.clearCpt();
	for (let cpt of this.components) {
	    this.map.setCpt(cpt.getBounds(), cpt);
	}
	let linked = true;
	for (let link of this.links) {
	    link.update();
	    linked = linked && link.isLinked();
	}
	return linked;
    }

    updateComponents() {
	for (let cpt of this.components) {
	    cpt.update();
	}
    }

    vec2grid(v: Vec2): Vec2 {
	let ts = this.tilesize;
	let x = int(v.x/ts);
	let y = int(v.y/ts);
	return new Vec2(x, y);
    }

    grid2vec(v: Vec2): Vec2 {
	let ts = this.tilesize;
	return new Vec2(v.x*ts+ts/2, v.y*ts+ts/2);
    }

    onMouseDown(ev: MouseEvent) {
	//log("onMouseDown: ", ev);
	for (let cpt of this.components) {
	    if (cpt.focus) {
		this._focused = cpt;
		break;
	    }
	}
	this.selection = this._focused;
	this._start = new Vec2(ev.clientX, ev.clientY);
	this._dragging = false;
	ev.preventDefault();
    }
    
    onMouseMove(ev: MouseEvent) {
	//log("onMouseMove: ", ev);
	if (this._focused !== null) {
	    let pos = new Vec2(ev.clientX, ev.clientY);
	    let delta = pos.sub(this._start);
	    if (!this._dragging) {
		if (DRAG_MIN <= delta.size()) {
		    this._dragging = true;
		    this._focused.dragStart();
		}
	    }
	    if (this._dragging) {
		this._focused.dragMove(delta);
		this.update();
	    }
	}
	ev.preventDefault();
    }
    
    onMouseUp(ev: MouseEvent) {
	//log("onMouseUp: ", ev);
	if (this._focused !== null) {
	    if (this._dragging) {
		let pos = new Vec2(ev.clientX, ev.clientY);
		this._focused.dragEnd();
	    }
	    this._focused = null;
	    this.update();
	} else {
	    this.updateComponents();
	}
	this._dragging = false;
	ev.preventDefault();
    }
    
    onMouseLeave(ev: MouseEvent) {
	//log("onMouseLeave: ", ev);
	this.onMouseUp(ev);
    }

    rotateSelection() {
	if (this.selection !== null) {
	    this.selection.rotate();
	    this.update();
	}
    }
}


// main: sets up the browser interaction.
let CANVAS: Canvas;
function main(width=480, height=480)
{
    function getprops(a: NodeListOf<Element>) {
	let d:any = {};
	for (let i = 0; i < a.length; i++) {
	    d[a[i].id] = a[i];
	}
	return d;
    }
  
    SOUNDS = getprops(document.getElementsByTagName('audio')) as SoundAsset;
    let svg = d3.select('#canvas');
    CANVAS = new Canvas(svg, 8);
    CANVAS.init();
}

function addDW(v: number) {
    let elem = document.getElementById('f_dw') as HTMLInputElement;
    v += parseInt(elem.value);
    if (!isNaN(v)) {
	CANVAS.setDataWidth(v, true);
	CANVAS.update();
    }
}

function addReg(v: number) {
    let elem = document.getElementById('f_reg') as HTMLInputElement;
    v += parseInt(elem.value);
    if (!isNaN(v)) {
	CANVAS.setNumRegs(v, true);
	CANVAS.update();
    }
}

function addALU(v: number) {
    let elem = document.getElementById('f_alu') as HTMLInputElement;
    v += parseInt(elem.value);
    if (!isNaN(v)) {
	CANVAS.setNumALUs(v, true);
	CANVAS.update();
    }
}

function rotateSelection() {
    CANVAS.rotateSelection();
}

function resetEverything() {
    CANVAS.uninit();
    CANVAS.init();
}
