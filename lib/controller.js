
module.exports = Controller

var Commandeger = require('./commandeger')

  , util = require('./util')

function Controller(model, o) {
  this.o = util.extend({
    noCollapseRoot: true,
    extra_commands: false
  }, o || {})
  this.model = model
  this.cmd = new Commandeger(this.model, this.o.extra_commands)

  this.model.db.listen('node', this.addFromDb.bind(this), this.updateFromDb.bind(this))

  var actions = {}
  for (var action in this.actions) {
    if ('string' === typeof this.actions[action]) actions[action] = this.actions[action]
    else actions[action] = this.actions[action].bind(this)
  }
  this.actions = actions
  this.listeners = {}
}

Controller.prototype = {
  addFromDb: function (id, data) {
    // if (this.model.ids[id]) return
    this.view.update(id, data)
    this.model.ids[id] = data
  },
  updateFromDb: function (id, data) {
    this.view.update(id, data)
    this.model.ids[id] = data
  },

  /**
   * Set the current view
   *
   * @param {class} View the View class
   * @param {object} options the options to pass to the view
   * @return {View} the view object
   */
  setView: function (View, options) {
    var oview = this.view
    this.view = new View(
      this.bindActions.bind(this),
      this.model, this.actions,
      options
    )

    var root = (oview ? oview.root : this.model.root);
    var node = this.view.initialize(root)
    if (oview) {
      oview.getNode().parentNode.replaceChild(node, oview.getNode());
    }
    this.cmd.setView(this.view)
    return this.view
  },

  /**
   * Undo the most recent comment
   */
  undo: function () {
    this.cmd.undo()
  },

  /**
   * Redo the most recent undo
   */
  redo: function () {
    this.cmd.redo()
  },

  /**
   * Attach a listener
   */
  on: function (evt, func) {
    if (!this.listeners[evt]) {
      this.listeners[evt] = []
    }
    this.listeners[evt].push(func)
  },

  /**
   * Remove a listener
   */
  off: function (evt, func) {
    if (!this.listeners[evt]) return false
    var i = this.listeners[evt].indexOf(func)
    if (i === -1) return false
    this.listeners[evt].splice(i, 1)
    return true
  },

  /**
   * Trigger an event
   */
  trigger: function (evt) {
    if (!this.listeners[evt]) return
    var args = [].slice.call(arguments, 1)
    for (var i=0; i<this.listeners[evt].length; i++) {
      this.listeners[evt][i].apply(null, args)
    }
  },

  /**
   * Create bound versions of each action function for a given id
   *
   * @param {string} id this id ts sins things
   */
  bindActions: function (id) {
    var actions = {}
      , val
    for (var action in this.actions) {
      val = this.actions[action]
      if ('string' === typeof val) {
        val = this[val][action].bind(this[val], id)
      } else {
        val = val.bind(this, id)
      }
      actions[action] = val
    }
    return actions
  },

  importData: function (data, parent) {
    if (arguments.length === 1) {
      parent = this.view.getActive();
    }
    if (parent === "new") {
        this.view.removeNew()
        parent = this.view.root
    }
    this.executeCommands('importData', [parent, 0, data])
    // this.model.createNodes(this.view.getActive(), 0, data)
    // this.view.rebase(this.view.root)
  },

  exportData: function () {
    return this.model.dumpData(this.model.root, true)
  },

  executeCommands: function () {
    var res
    if (arguments.length === 1 && Array.isArray(arguments[0])) {
      res = this.cmd.executeCommands.apply(this.cmd, arguments[0])
    } else {
      res = this.cmd.executeCommands.apply(this.cmd, arguments)
    }
    this.trigger('change')
    return res
  },

  // public
  setCollapsed: function (id, doCollapse) {
    if (this.o.noCollapseRoot && id === this.view.root) return
    if (!this.model.hasChildren(id)) return
    if (this.model.isCollapsed(id) === doCollapse) return
    this.executeCommands('collapse', [id, doCollapse]);
  },

  addBefore: function (id, text) {
    var nw = this.model.idNew(id, true)
    this.executeCommands('newNode', [nw.pid, nw.index, text])
  },

  actions: {
    trigger: function () {
      this.trigger.apply(this, arguments)
    },

    setActive: function (id) {
      this.view.setActive(id)
    },

    // move focus
    goUp: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return this.view.goTo(this.view.root)
      // should I check to see if it's ok?
      var above = this.model.idAbove(id)
      if (above === undefined) return
      this.view.startEditing(above);
    },

    goDown: function (id, fromStart) {
      if (id === 'new') return this.view.goTo(this.view.root)
      var below = this.model.idBelow(id, this.view.root)
      if (below === undefined) return
      this.view.startEditing(below, fromStart);
    },

    goLeft: function (id) {
      if (id === 'new') return this.view.goTo(this.view.root)
      if (id === this.view.root) return
      var parent = this.model.getParent(id)
      if (!parent) return
      this.view.startEditing(parent)
    },

    goRight: function (id) {
      if (id === 'new') return this.view.goTo(this.view.root)
      var child = this.model.getChild(id)
      if (!child) return
      this.view.startEditing(child)
    },

    startMoving: function (id) {
      if (id === 'new') return
      if (id === this.view.root) return
      this.view.startMoving(id)
    },

    // modification
    undo: function () {this.cmd.undo()},
    redo: function () {this.cmd.redo()},

    // commanders
    cut: function (ids) {
      if (ids === this.view.root) return
      if (!Array.isArray(ids)) {
        ids = [ids]
      }
      this.executeCommands('cut', [ids])
    },

    copy: function (ids) {
      if (!Array.isArray(ids)) {
        ids = [ids]
      }
      this.executeCommands('copy', [ids])
    },

    pasteAbove: function (id) {
      return this.actions.paste(id, true)
    },

    paste: function (id, above) {
      if (!this.model.clipboard) return
      var nw = this.model.idNew(id, above)
      this.executeCommands('paste', [nw.pid, nw.index])
    },

    changeContent: function (id, content) {
      if (id === 'new') {
        if (!content) return
        var nw = this.view.removeNew()
        this.executeCommands('newNode', [nw.pid, nw.index, content, {}])
        return
      }
      this.executeCommands('changeContent', [id, content])
    },

    changed: function (id, attr, value) {
      if (id === 'new') {
        if (!value) return
        var nw = this.view.removeNew()
        var meta = {}
        meta[attr] = value
        this.executeCommands('newNode', [nw.pid, nw.index, '', meta])
        return
      }
      this.executeCommands('changeNodeAttr', [id, attr, value])
    },

    // move node
    move: function (where, id, target) {
      var action = {
        before: 'ToBefore',
        after: 'ToAfter',
        child: 'Into',
        lastChild: 'IntoLast'
      }[where]
      this.actions['move' + action](id, target)//target, id)
    },

    moveToBefore: function (id, sid) {
      if (id === this.view.root) return
      if (id === 'new') return
      var place = this.model.moveBeforePlace(sid, id)
      if (!place) return
      // if (this.model.samePlace(id, place)) return
      this.executeCommands('move', [id, place.pid, place.ix])
    },

    moveToAfter: function (id, sid) {
      if (id === this.view.root) return
      if (id === 'new') return
      var place = this.model.moveAfterPlace(sid, id)
      if (!place) return
      // if (this.model.samePlace(id, place)) return
      this.executeCommands('move', [id, place.pid, place.ix])
    },

    moveInto: function (id, pid) {
      if (id === this.view.root) return
      if (id === 'new') return
      if (this.model.samePlace(id, {pid: pid, ix: 0})) return
      if (!this.model.isCollapsed(pid)) {
        return this.executeCommands('move', [id, pid, 0])
      }
      this.executeCommands('collapse', [pid, false], 'move', [id, pid, 0])
    },

    moveIntoLast: function (id, pid) {
      if (id === this.view.root) return
      if (id === 'new') return
      var ix = this.model.ids[pid].children.length
      if (this.model.samePlace(id, {pid: pid, ix: ix})) return
      if (!this.model.isCollapsed(pid)) {
        return this.executeCommands('move', [id, pid, ix])
      }
      this.executeCommands('collapse', [pid, false], 'move', [id, pid, ix])
    },

    moveRight: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return
      var sib = this.model.prevSibling(id, true)
      if (undefined === sib) return
      if (!this.model.isCollapsed(sib)) {
        return this.executeCommands('move', [id, sib, false])
      }
      this.executeCommands('collapse', [sib, false], 'move', [id, sib, false])
    },

    moveLeft: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return
      if (this.model.ids[id].parent === this.view.root) return
      // TODO handle multiple selected
      var place = this.model.shiftLeftPlace(id)
      if (!place) return
      this.executeCommands('move', [id, place.pid, place.ix])
    },

    moveUp: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return
      // TODO handle multiple selected
      var place = this.model.shiftUpPlace(id)
      if (!place) return
      if (place.pid === this.model.ids[this.view.root].parent) return
      this.executeCommands('move', [id, place.pid, place.ix])
    },

    moveDown: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return
      // TODO handle multiple selected
      var place = this.model.shiftDownPlace(id)
      if (!place) return
      if (place.pid === this.model.ids[this.view.root].parent) return
      this.executeCommands('move', [id, place.pid, place.ix])
    },

    moveToTop: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return
      var first = this.model.firstSibling(id)
      if (undefined === first) return
      var pid = this.model.ids[first].parent
      if (pid === undefined) return
      var ix = this.model.ids[pid].children.indexOf(first)
      this.executeCommands('move', [id, pid, ix])
    },

    moveToBottom: function (id) {
      if (id === this.view.root) return
      if (id === 'new') return
      var last = this.model.lastSibling(id)
      if (undefined === last) return
      var pid = this.model.ids[last].parent
      if (pid === undefined) return
      var ix = this.model.ids[pid].children.indexOf(last)
      this.executeCommands('move', [id, pid, ix + 1])
    },

    toggleCollapse: function (id, yes) {
      if (this.o.noCollapseRoot && id === this.view.root) return
      if (id === 'new') return
      if (arguments.length === 1) {
        yes = !this.model.hasChildren(id) || !this.model.isCollapsed(id)
      }
      if (yes) {
        id = this.model.findCollapser(id)
        if (this.o.noCollapseRoot && id === this.view.root) return
        if (!this.model.hasChildren(id) || this.model.isCollapsed(id)) return
      } else {
        if (!this.model.hasChildren(id) || !this.model.isCollapsed(id)) return
      }
      this.executeCommands('collapse', [id, yes])
    },

    addChild: function (pid, index, content, config) {
      this.executeCommands('newNode', [pid, index, content, config])
    },

    commands: function () {
      this.executeCommands.apply(this, arguments)
    },

    addBefore: function (id, text, focus) {
      if (id === this.view.root) return
      if (id === 'new') {
        // TODO: better behavior here
        return
      }
      var nw = this.model.idNew(id, true)
      this.executeCommands('newNode', [nw.pid, nw.index, text])
      if (focus) this.view.startEditing()
    },

    addAfter: function (id, text, focus) {
      var nw
      var ed = focus || this.view.mode === 'insert'
      // this.view.stopEditing()
      if (id === 'new') {
        // TODO: better behavior here

        nw = this.view.removeNew()
        this.executeCommands(
          'newNode', [nw.pid, nw.index+1, '']
        )
        if (ed) this.view.startEditing()
        return
      }
      if (id === this.view.root) {
        var node = this.model.ids[id]
        if (!node.children || !node.children.length) {
          if (this.view.newNode) return this.view.startEditing('new')
          this.view.addNew(id, 0)
          this.view.startEditing('new')
          return
        }
      }
      nw = this.model.idNew(id, false, this.view.root)
      this.executeCommands('newNode', [nw.pid, nw.index, text])
      if (ed) this.view.startEditing()
    },

    remove: function (id, addText) {
      if (id === this.view.root) return
      if (id === 'new') return
      var before = this.model.idAbove(id)
      this.executeCommands(
        'remove', [id],
        'appendText', [before, addText || '']
      )
    },

    setEditing: 'view',
    doneEditing: 'view'
  }
}

