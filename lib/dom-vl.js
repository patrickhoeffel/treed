
var DropShadow = require('./drop-shadow')
  , slideDown = require('./slide-down')
  , slideUp = require('./slide-up')
  , util = require('./util')

module.exports = DomViewLayer

/**
 * o: options -> { Node: the class }
 */
function DomViewLayer(o) {
  this.dom = {}
  this.root = null
  this.o = util.merge({
    animate: true
  }, o)
}

DomViewLayer.prototype = {
  /**
   * Forget about all nodes - they will be disposed of
   */
  clear: function () {
    this.dom = {}
  },

  /**
   * root: the old root that is to be replaced
   */
  rebase: function (root) {
    if (root.parentNode) {
      root.parentNode.replaceChild(this.root, root)
    }
  },

  /**
   * Recursively generate the drop target definitions for all of the visible
   * nodes under a given root.
   *
   * root: the id of the node to start from
   * model: the model - to find children
   * moving: the id of the node that's moving - so that you won't drop a node
   *         inside itself
   * top: only true the first call, determines if it's the root node (e.g. no
   *      drop target above)
   */
  dropTargets: function (root, model, moving, top) {
    var targets = []
      , bc = this.dom[root].head.getBoundingClientRect()
      , target
      , childTarget

    if (!top) {
      targets.push({
        id: root,
        top: bc.top,
        left: bc.left,
        width: bc.width,
        height: bc.height,
        place: 'before',
        show: {
          left: bc.left,// + 20,
          width: bc.width,// - 20,
          y: bc.top
        }
      })
    }
    if (root === moving) return targets

    if (model.isCollapsed(root) && !top) return targets
    var ch = model.ids[root].children
    if (ch) {
      for (var i=0; i<ch.length; i++) {
        targets = targets.concat(this.dropTargets(ch[i], model, moving))
      }
    }
    if (top) {
      var bodyBox = this.dom[root].ul.getBoundingClientRect()
      targets.push({
        id: root,
        top: bodyBox.bottom,
        left: bodyBox.left,
        width: bodyBox.width,
        height: bc.height,
        place: 'lastChild',
        show: {
          left: bodyBox.left,// + 20,
          width: bodyBox.width,// - 20,
          y: bodyBox.bottom
        }
      })
    }
    return targets
  },

  makeDropShadow: function () {
    return new DropShadow()
  },

  /**
   * Remove a node
   *
   * id: the node to remove
   * pid: the parent id
   * lastchild: whether the node was the last child
   */
  remove: function (id, pid, lastchild) {
    var n = this.dom[id]
    if (!n || !n.main.parentNode) return
    try {
      n.main.parentNode.removeChild(n.main)
    } catch (e) {
      return
    }
    delete this.dom[id]
    if (lastchild) {
      this.dom[pid].main.classList.remove('treed__item--parent')
    }
  },

  /**
   * Add a new node - this is public facing
   *
   * node: object looks like {id:, content:, meta:, parent:}
   * bounds: an object of action functions
   * before: the id before which to add
   * children: whether the new node has children
   */
  addNew: function (node, bounds, modelActions, before, children) {
    var dom = this.makeNode(node.id, node.content, node.meta, node.depth - this.rootDepth, bounds, modelActions)
    this.add(node.parent, before, dom, children)
    if (node.collapsed && node.children.length) {
      this.setCollapsed(node.id, true)
    }
  },

  /**
   * Internal function for adding things
   */
  add: function (parent, before, dom, children) {
    var p = this.dom[parent]
    if (before === false) {
      p.ul.appendChild(dom)
    } else {
      var bef = this.dom[before]
      p.ul.insertBefore(dom, bef.main)
    }
    p.main.classList.add('treed__item--parent')
    if (children) {
      dom.classList.add('treed__item--parent')
    }
  },

  clearChildren: function (id) {
    var ul = this.dom[id].ul
    while (ul.lastChild) {
      ul.removeChild(ul.lastChild)
    }
  },

  /**
   * Get a body
   */
  body: function (id) {
    if (!this.dom[id]) return
    return this.dom[id].body
  },

  /**
   * Move a node from one place to another
   *
   * id:        the id of the node that's moving
   * pid:       the parent id to move it to
   * before:    the node id before which to move it. `false` to append
   * ppid:      the previous parent id
   * lastchild: whether this was the last child of the previous parent
   *            (leaving that parent childless)
   */
  move: function (id, pid, before, ppid, lastchild) {
    var d = this.dom[id]
    d.main.parentNode.removeChild(d.main)
    if (lastchild) {
      this.dom[ppid].main.classList.remove('treed__item--parent')
    }
    if (before === false) {
      this.dom[pid].ul.appendChild(d.main)
    } else {
      this.dom[pid].ul.insertBefore(d.main, this.dom[before].main)
    }
    this.dom[pid].main.classList.add('treed__item--parent')
  },

  /**
   * Remove the selection from a set of nodes
   *
   * selection: [id, ...] nodes to deselect
   */
  clearSelection: function (selection) {
    for (var i=0; i<selection.length; i++) {
      if (!this.dom[selection[i]]) continue;
      this.dom[selection[i]].main.classList.remove('selected')
    }
  },

  /**
   * Show the selection on a set of nodes
   *
   * selection: [id, ...] nodes to select
   */
  showSelection: function (selection) {
    if (!selection.length) return
    // util.ensureInView(this.dom[selection[0]].body.node)
    for (var i=0; i<selection.length; i++) {
      this.dom[selection[i]].main.classList.add('selected')
    }
  },

  clearActive: function (id) {
    if (!this.dom[id]) return
    this.dom[id].main.classList.remove('active')
  },

  showActive: function (id) {
    if (!this.dom[id]) return console.warn('Trying to activate a node that is not rendered')
    util.ensureInView(this.dom[id].body.node)
    this.dom[id].main.classList.add('active')
  },

  setCollapsed: function (id, isCollapsed) {
    this.dom[id].main.classList[isCollapsed ? 'add' : 'remove']('collapsed')
  },

  animateOpen: function (id) {
    this.setCollapsed(id, false)
    slideDown(this.dom[id].ul)
  },

  animateClosed: function (id, done) {
    slideUp(this.dom[id].ul, function () {
      this.setCollapsed(id, true)
    }.bind(this))
  },

  setMoving: function (id, isMoving) {
    this.root.classList[isMoving ? 'add' : 'remove']('moving')
    this.dom[id].main.classList[isMoving ? 'add' : 'remove']('moving')
  },

  setDropping: function (id, isDropping, isChild) {
    var cls = 'dropping' + (isChild ? '-child' : '')
    this.dom[id].main.classList[isDropping ? 'add' : 'remove'](cls)
  },

  /**
   * Create the root node
   */
  makeRoot: function (node, bounds, modelActions) {
    var dom = this.makeNode(node.id, node.content, node.meta, 0, bounds, modelActions)
      , root = document.createElement('div')
    root.classList.add('treed')
    root.appendChild(dom)
    if (node.children.length) {
      dom.classList.add('treed__item--parent')
    }
    if (node.collapsed && node.children.length) {
      this.setCollapsed(node.id, true)
    }
    this.root = root
    this.rootDepth = node.depth
    return root
  },

  /**
   * Make the head for a given node
   */
  makeHead: function (body, actions) {
    var head = document.createElement('div')
      , collapser = document.createElement('div')

    collapser.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return
      actions.toggleCollapse()
      e.preventDefault()
    })
    collapser.classList.add('treed__collapser')

    /*
    //  , mover = document.createElement('div')
    mover.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      actions.startMoving()
      return false
    })
    mover.classList.add('treed__mover')
    // head.appendChild(mover)
    */

    head.classList.add('treed__head')
    head.appendChild(collapser)
    head.appendChild(body.node);
    return head
  },

  /**
   * Make a node
   */
  makeNode: function (id, content, meta, level, bounds, modelActions) {
    var dom = document.createElement('li')
      , body = this.bodyFor(id, content, meta, bounds, modelActions)

    dom.classList.add('treed__item')
    // dom.classList.add('treed__item--level-' + level)

    var head = this.makeHead(body, bounds)
    dom.appendChild(head)

    var ul = document.createElement('ul')
    ul.classList.add('treed__children')
    dom.appendChild(ul)
    this.dom[id] = {main: dom, body: body, ul: ul, head: head}
    return dom
  },

  /** 
   * Create a body node
   *
   * id: the node if
   * content: the text
   * meta: an object of meta data
   * bounds: bound actions
   */
  bodyFor: function (id, content, meta, bounds, modelActions) {
    var dom = new this.o.Node(content, meta, bounds, id === 'new', modelActions)
    dom.node.classList.add('treed__body')
    return dom
  },

}

