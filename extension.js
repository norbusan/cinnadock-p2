// FIXME: Which signals need to be stored and later disconnected? Which ones
// do not? That could streamline some aspects of the code, as a lot of it is
// signal related, maybe unnecessarily much.
const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const DND = imports.ui.dnd;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;


// Returns [x1,x2] so that the area between x1 and x2 is centered in length
function center(length, naturalLength) {
  let maxLength = Math.min(length, naturalLength);
  let x1 = Math.max(0, Math.floor((length - maxLength) / 2));
  let x2 = Math.min(length, x1 + maxLength);
  return [x1, x2];
}

const UUID = "CinnaDockPlus@entelechy";

// Settings
const DOCK_APPS_KEY = 'favorite-apps';
const APPLICATION_ICON_SIZE = 22;
const ENTER_TIMEOUT = 200;
const LEAVE_TIMEOUT = 0;
const MIN_ICON_SIZE = 20;
const MAX_ICON_SIZE = 96.0;
const ICON_HEIGHT_FACTOR = 0.9;
const ICON_ANIM_FACTOR = 0.65;
const ICON_ANIM_STEP_TIME = 0.2;
const BUTTON_BOX_ANIMATION_TIME = 0.5;
const TITLE_LENGTH = 40;

const PositionMode = {
  LEFT: 0,
  RIGHT: 1,
  TOP: 2,
  BOTTOM: 3
};

const AutoHideEffect = {
  RESIZE: 0,
  RESCALE: 1
};

let hideable = true;
let hideDock = true;

function createWindowClone(metaWindow, size, withTransients, withPositions) {
  let clones = [];
  let textures = [];

  if (!metaWindow) {
    return clones;
  }

  let metaWindowActor = metaWindow.get_compositor_private();
  if (!metaWindowActor) {
    return clones;
  }
  let texture = metaWindowActor.get_texture();
  let [width, height] = metaWindowActor.get_size();
  let [maxWidth, maxHeight] = [width, height];
  let [x, y] = metaWindowActor.get_position();
  let [minX, minY] = [x, y];
  let [maxX, maxY] = [minX + width, minY + height];
  textures.push({t: texture, x: x, y: y, w: width, h: height});
  if (withTransients) {
    metaWindow.foreach_transient(function(win) {
      let metaWindowActor = win.get_compositor_private();
      texture = metaWindowActor.get_texture();
      [width, height] = metaWindowActor.get_size();
      [x, y] = metaWindowActor.get_position();
      maxWidth = Math.max(maxWidth, width);
      maxHeight = Math.max(maxHeight, height);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
      textures.push({t: texture, x: x, y: y, w: width, h: height});
    });
  }
  let scale = 1;
  if (size) {
    if (withPositions) {
      scale = Math.min(size/Math.max(maxX - minX, maxY - minY), 1);
    } else {
      scale = Math.min(size/Math.max(maxWidth, maxHeight), 1);
    }
  }
  for (i in textures) {
    let data = textures[i];
    let [texture, width, height, x, y] =
        [data.t, data.w, data.h, data.x, data.y];
    if (withPositions) {
      x -= minX;
      y -= minY;
    }
    let params = {};
    params.source = texture;
    if (scale != 1) {
      params.width = Math.round(width * scale);
      params.height = Math.round(height * scale);
      x = Math.round(x * scale);
      y = Math.round(y * scale);
    }
    let clone = {actor: new Clutter.Clone(params), x: x, y: y};
    clones.push(clone);
  }
  return clones;
}

/*********************************/
/****start of resize functions****/
/*********************************/
function hideDock_size()
{
  if (hideable) {
    let monitor = Main.layoutManager.primaryMonitor;
    if (this._displayMonitor > -1 &&
        this._displayMonitor < Main.layoutManager.monitors.length) {
      monitor = Main.layoutManager.monitors[this._displayMonitor];
    }
    let height = 0;
    let width = 0;
    let position_x = 0;
    let position_y = 0;

    Tweener.addTween(this, {
        _item_size: 1,
        time: this.hide_effect_duration * 0.001,
        transition: 'easeOutQuad',
        onUpdate: function()
         {
         switch (this.position) {
          case PositionMode.TOP:
            height = this._item_size + 4 * this._spacing;
            width = (this._nicons) * (this._item_size + this._spacing)
              + 2 * this._spacing;
            position_x = monitor.x + (monitor.width - width) / 2;
            position_y = monitor.y - 2 * this._spacing;
            break;
          case PositionMode.BOTTOM:
            height = this._item_size + 4 * this._spacing;
            width = (this._nicons) * (this._item_size + this._spacing)
              + 2 * this._spacing;
            position_x = monitor.x + (monitor.width - width) / 2;
            position_y = monitor.y + (monitor.height - this._item_size
              - 2 * this._spacing);
            break;
          case PositionMode.LEFT:
            height = (this._nicons) * (this._item_size + this._spacing)
              + 2 * this._spacing;
            width = this._item_size + 4 * this._spacing;
            position_x = monitor.x - 2 * this._spacing;
            position_y = monitor.y + (monitor.height - height) / 2;
            break;
          case PositionMode.RIGHT:
          default:
           height = (this._nicons) * (this._item_size + this._spacing)
             + 2 * this._spacing;
           width = this._item_size + 4 * this._spacing;
           position_x = monitor.x + (monitor.width - this._item_size
             - 2 * this._spacing);
           position_y = monitor.y + (monitor.height - height) / 2;
         }
         this.actor.set_position(position_x, position_y);
         this.actor.set_size(width, height);
         // Force the layout manager to update the input region
         Main.layoutManager._chrome.updateRegions();
         },  
    });
    hideDock = true;
  }
}

function showDock_size()
{
  let monitor = Main.layoutManager.primaryMonitor;
  if (this._displayMonitor > -1 &&
      this._displayMonitor < Main.layoutManager.monitors.length) {
    monitor = Main.layoutManager.monitors[this._displayMonitor];
  }
  let height = 0;
  let width = 0;
  let position_x = 0;
  let position_y = 0;

  Tweener.addTween(this, {
      _item_size: this.icon_size,
      time: this.hide_effect_duration * 0.001,
      transition: 'easeOutQuad',
      onUpdate: function()
      {
       switch (this.position) {
        case PositionMode.TOP:
          height = this._item_size + 4 * this._spacing;
          width = (this._nicons) * (this._item_size + this._spacing)
            + 2 * this._spacing;
          position_x = monitor.x + (monitor.width - width) / 2;
          position_y = monitor.y - 2 * this._spacing;
          break;
        case PositionMode.BOTTOM:
          height = this._item_size + 4 * this._spacing;
          width = (this._nicons) * (this._item_size + this._spacing)
            + 2 * this._spacing;
          position_x = monitor.x + (monitor.width - width) / 2;
          position_y = monitor.y + (monitor.height - this._item_size
            - 2 * this._spacing);
          break;
        case PositionMode.LEFT:
          height = (this._nicons) * (this._item_size + this._spacing)
            + 2 * this._spacing;
          width = this._item_size + 4 * this._spacing;
          position_x = monitor.x - 2 * this._spacing;
          position_y = monitor.y + (monitor.height - height) / 2;
          break;
        case PositionMode.RIGHT:
        default:
          height = (this._nicons) * (this._item_size + this._spacing)
            + 2 * this._spacing;
          width = this._item_size + 4 * this._spacing;
          position_x = monitor.x + (monitor.width - this._item_size
            - 2 * this._spacing);
          position_y = monitor.y + (monitor.height - height) / 2;
       }
       this.actor.set_position(position_x, position_y);
       this.actor.set_size(width, height);
       // Force the layout manager to update the input region
       Main.layoutManager._chrome.updateRegions();
       }
  });
  hideDock = false;
}

function initShowDock_size()
{
  this._item_size = 1;
  this._showDock();
}

function showEffectAddItem_size()
{
  let monitor = Main.layoutManager.primaryMonitor;
  if (this._displayMonitor > -1 &&
      this._displayMonitor < Main.layoutManager.monitors.length) {
    monitor = Main.layoutManager.monitors[this._displayMonitor];
  }
  let height = 0;
  let width = 0;
  let position_x = 0;
  let position_y = 0;

  switch (this.position) {
  case PositionMode.TOP:
    height = this._item_size + 4 * this._spacing;
    width =
        (this._nicons) * (this._item_size + this._spacing) +
        2 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y = monitor.y - 2 * this._spacing;
    break;
  case PositionMode.BOTTOM:
    height = this._item_size + 4 * this._spacing;
    width =
        (this._nicons) * (this._item_size + this._spacing) +
        2 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y =
        monitor.y + (monitor.height - this._item_size -
         2 * this._spacing);
    break;
  case PositionMode.LEFT:
    height =
        (this._nicons) * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x = monitor.x - 2 * this._spacing;
    position_y = monitor.y + (monitor.height - height) / 2;
    break;
  case PositionMode.RIGHT:
  default:
    height =
        (this._nicons) * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x =
        monitor.x + (monitor.width - this._item_size -
         2 * this._spacing);
    position_y = monitor.y + (monitor.height - height) / 2;
  }

  Tweener.addTween(this.actor, {
      x: position_x, y: position_y, height: height, width: width,
      time: this.hide_effect_duration * 0.001, transition: 'easeOutQuad',
      onUpdate: function()
      {
        // Force the layout manager to update the input region
        Main.layoutManager._chrome.updateRegions();
      }
  });
}

/*** end of resize functions ***/

/**********************************/
/****start of rescale functions****/
/**********************************/
function hideDock_scale()
{
  this._item_size = this.icon_size;
  let monitor = Main.layoutManager.primaryMonitor;
  if (this._displayMonitor > -1 &&
      this._displayMonitor < Main.layoutManager.monitors.length) {
    monitor = Main.layoutManager.monitors[this._displayMonitor];
  }
  let position_x = 0;
  let position_y = 0;
  let height = 0;
  let width = 0;

  switch (this.position) {
  case PositionMode.TOP:
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y = monitor.y;
    break;
  case PositionMode.BOTTOM:
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y = monitor.y + monitor.height - 1;
    break;
  case PositionMode.LEFT:
    height =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x = monitor.x;
    position_y = monitor.y + (monitor.height - height) / 2;
    break;
  case PositionMode.RIGHT:
  default:
    height =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x = monitor.x + monitor.width - 1;
    position_y = monitor.y + (monitor.height - height) / 2;
  }

  if (hideable) {
    switch (this.position) {
    case PositionMode.TOP:
    case PositionMode.BOTTOM:
      Tweener.addTween(this.actor, {
          x: position_x,
          y: position_y,
          height: height,
          width: width,
          scale_y: 0.025,
          time: this.hide_effect_duration * 0.001,
          transition: 'easeOutQuad',
          onUpdate: function()
          {
           Main.layoutManager._chrome.updateRegions();
          }
      });
      break;
    case PositionMode.TOP:
    case PositionMode.BOTTOM:
    default:
      Tweener.addTween(this.actor, {
          x: position_x, y: position_y, height: height, width: width,
          scale_x: 0.025, time: this.hide_effect_duration * 0.001,
          transition: 'easeOutQuad',
          onUpdate: function()
          {
            Main.layoutManager._chrome.updateRegions();
          }
      });
    }
    hideDock = true;
  }
}

function showDock_scale()
{
  this._item_size = this.icon_size;
  let monitor = Main.layoutManager.primaryMonitor;
  if (this._displayMonitor > -1 &&
      this._displayMonitor < Main.layoutManager.monitors.length) {
    monitor = Main.layoutManager.monitors[this._displayMonitor];
  }
  let height = 0;
  let width = 0;
  let position_x = 0;
  let position_y = 0;

  switch (this.position) {
  case PositionMode.TOP:
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y = monitor.y - 2 * this._spacing;
    break;
  case PositionMode.BOTTOM:
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y =
        monitor.y + (monitor.height - this._item_size -
         2 * this._spacing);
    break;
  case PositionMode.LEFT:
    height =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x = monitor.x - 2 * this._spacing;
    position_y = monitor.y + (monitor.height - height) / 2;
    break;
  case PositionMode.RIGHT:
  default:
    height =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x =
        monitor.x + (monitor.width - this._item_size -
         2 * this._spacing);
    position_y = monitor.y + (monitor.height - height) / 2;
  }
  Tweener.addTween(this.actor, {
      x: monitor.x + position_x,
      y: monitor.y + position_y,
      height: height,
      width: width,
      scale_x: 1,
      scale_y: 1,
      time: this.hide_effect_duration * 0.001,
      transition: 'easeOutQuad',
      onUpdate: function()
      {
        // Force the layout manager to update the input region
        Main.layoutManager._chrome.updateRegions();
      }
  });
  hideDock = false;
}

function initShowDock_scale()
{
  this._item_size = this.icon_size;
  let monitor = Main.layoutManager.primaryMonitor;
  if (this._displayMonitor > -1 &&
      this._displayMonitor < Main.layoutManager.monitors.length) {
    monitor = Main.layoutManager.monitors[this._displayMonitor];
  }
  let height = 0;
  let width = 0;
  let position_x = 0;
  let position_y = 0;

  switch (this.position) {
  case PositionMode.TOP:
    this.actor.y = 0;
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y = monitor.y - 2 * this._spacing;
    break;
  case PositionMode.BOTTOM:
    this.actor.y = monitor.height - 1;
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y =
        monitor.y + (monitor.height - this._item_size -
         2 * this._spacing);
    break;
  case PositionMode.LEFT:
    this.actor.x = 0;
    height =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x = monitor.x - 2 * this._spacing;
    position_y = monitor.y + (monitor.height - height) / 2;
    break;
  case PositionMode.RIGHT:
  default:
    this.actor.x = monitor.width - 1;
    height =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x =
        monitor.x + (monitor.width - this._item_size -
        2 * this._spacing);
    position_y = monitor.y + (monitor.height - height) / 2;
  }

  this.actor.set_scale(0, 0);
  this.actor.set_size(width, height);

  // Effect of creation of the dock
  Tweener.addTween(this.actor, {
      x: position_x,
      y: position_y,
      height: height,
      width: width,
      time: this.hide_effect_duration * 3 * 0.001,
      transition: 'easeOutQuad',
      onUpdate: function()
      {
        // Force the layout manager to update the input region
        Main.layoutManager._chrome.updateRegions();
      }
  });

  Tweener.addTween(this.actor, {
      scale_x: 1,
      scale_y: 1,
      time: this.hide_effect_duration * 3 * 0.001,
      transition: 'easeOutQuad',
      onUpdate: function()
      {
        // Force the layout manager to update the input region
        Main.layoutManager._chrome.updateRegions();
      }
  });
  hideDock = false;
}

function showEffectAddItem_scale()
{
  this._item_size = this.icon_size;
  let monitor = Main.layoutManager.primaryMonitor;
  if (this._displayMonitor > -1 &&
      this._displayMonitor < Main.layoutManager.monitors.length) {
    monitor = Main.layoutManager.monitors[this._displayMonitor];
  }
  let height = 0;
  let width = 0;
  let position_x = 0;
  let position_y = 0;

  switch (this.position) {
  case PositionMode.TOP:
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y = monitor.y - 2 * this._spacing;
    break;
  case PositionMode.BOTTOM:
    width =
        this._nicons * (this._item_size + this._spacing) +
        2 * this._spacing;
    height = this._item_size + 4 * this._spacing;
    position_x = monitor.x + (monitor.width - width) / 2;
    position_y =
        monitor.y + (monitor.height - this._item_size -
         2 * this._spacing);
    break;
  case PositionMode.LEFT:
    height =
        this._nicons * (this._item_size + this._spacing) + 2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x = monitor.x - 2 * this._spacing;
    position_y = monitor.y + (monitor.height - height) / 2;
    break;
  case PositionMode.RIGHT:
  default:
    height =
        this._nicons * (this._item_size + this._spacing) + 2 * this._spacing;
    width = this._item_size + 4 * this._spacing;
    position_x =
        monitor.x + (monitor.width - this._item_size - 2 * this._spacing);
    position_y = monitor.y + (monitor.height - height) / 2;
  }

  Tweener.addTween(this.actor, {
      x: position_x,
      y: position_y,
      height: height,
      width: width,
      time: this.hide_effect_duration * 0.001,
      transition: 'easeOutQuad',
      onUpdate: function()
      {
        // Force the layout manager to update the input region
        Main.layoutManager._chrome.updateRegions();
      }
  });
}

/*** end of rescale functions ***/

function SuperscriptIconButton() {
  this._init.apply (this, arguments);
}

SuperscriptIconButton.prototype = {

  _init: function(icon) {
    if (icon == null)
      throw 'SuperscriptIconButton icon argument must be non-null';

    this.actor = new St.Bin( {
      reactive: true,
      can_focus: true,
      x_fill: true,
      y_fill: true,
      track_hover: true
    });

    this.actor._delegate = this;

    // We do a fancy layout with icons and labels, so we'd like to do our
    // own allocation in a Cinnamon.GenericContainer
    this._container = new Cinnamon.GenericContainer( {
      name: 'superscriptIconButton'
    });
    this._container.connect('get-preferred-width', Lang.bind(this,
      this._getPreferredWidth));
    this._container.connect('get-preferred-height', Lang.bind(this,
      this._getPreferredHeight));
    this._container.connect('allocate', Lang.bind(this, this._allocate));
    this.actor.set_child(this._container);

    this._iconBox = new Cinnamon.Slicer( {
      name: 'appBoxIcon', style: 'padding: 0.5em; margin: 0.5em;'
    });
    this._iconBox.connect('style-changed', Lang.bind(this,
      this._onIconBoxStyleChanged));
    this._iconBox.connect('notify::allocation', Lang.bind(this,
      this._updateIconBoxClip));
    this._iconBox.set_child(icon);
    this._container.add_actor(this._iconBox);

    this._numLabel = new St.Label( {
      style_class: 'window-list-item-label',
      style: 'text-shadow: black 1px 1px 2px;'
    });
    this._container.add_actor(this._numLabel);
    this._iconBottomClip = 0;
  },

  // Assume for now already formatted as text
  setWindowNum: function(text) {
    this._numLabel.set_text(text);
    this._container.queue_relayout();
  },

  //------------------------------------------
  //-- Callbacks for display-related things --
  //------------------------------------------
  _onIconBoxStyleChanged: function() {
    let node = this._iconBox.get_theme_node();
    this._iconBottomClip = node.get_length('app-icon-bottom-clip');
    this._updateIconBoxClip();
  },

  _updateIconBoxClip: function() {
    let allocation = this._iconBox.allocation;
    if (this._iconBottomClip > 0)
      this._iconBox.set_clip(0, 0, allocation.x2 - allocation.x1,
          allocation.y2 - allocation.y1 - this._iconBottomClip);
    else
      this._iconBox.remove_clip();
  },

  _getPreferredWidth: function(actor, forHeight, alloc) {
    [alloc.min_size, alloc.natural_size] =
        this._iconBox.get_preferred_width(forHeight);
  },

  _getPreferredHeight: function(actor, forWidth, alloc) {
    [alloc.min_size, alloc.natural_size] =
        this._iconBox.get_preferred_height(forWidth);
  },

  _allocate: function(actor, box, flags) {
    let allocWidth = box.x2 - box.x1;
    let allocHeight = box.y2 - box.y1;
    let childBox = new Clutter.ActorBox();
    let rtl = (St.Widget.get_default_direction() == St.TextDirection.RTL);

    // Set the icon to be left-justified (or right-justified)
    // and centered vertically
    let [iconMinWidth, iconMinHeight, iconNaturalWidth, iconNaturalHeight] =
        this._iconBox.get_preferred_size();
    [childBox.y1, childBox.y2] = center(allocHeight, iconNaturalHeight);
    if (rtl)
    {
      [childBox.x1, childBox.x2] =
          [Math.max(0, allocWidth - iconNaturalWidth), allocWidth];
    }
    else
    {
      [childBox.x1, childBox.x2] = [0, Math.min(iconNaturalWidth, allocWidth)];
    }
    this._iconBox.allocate(childBox, flags);

    let iconWidth = childBox.x2 - childBox.x1;
    if (rtl)
    {
      childBox.x1 = -3 + iconWidth - this._numLabel.get_preferred_width
          (this._numLabel.height)[0] * (this._numLabel.get_text().length + 1);
      childBox.x2 = childBox.x1 + this._numLabel.width;
      childBox.y1 = box.y1 + 3;
      childBox.y2 = Math.max(box.y2 - 1, childBox.y1);
      this._numLabel.allocate(childBox, flags);
    }
    else
    {
      childBox.x1 = -3 + 3;
      childBox.x2 = childBox.x1 + this._numLabel.width;
      childBox.y1 = box.y1 - 2 + 3;
      childBox.y2 = Math.max(box.y2 - 1, childBox.y1);
      this._numLabel.allocate(childBox, flags);
    }
  },

  show: function(animate, targetWidth) {
    if (!animate)
    {
      this.actor.show();
      return;
    }

    let width = this.oldWidth || targetWidth;
    if (!width)
    {
      let [minWidth, naturalWidth] = this.actor.get_preferred_width(-1);
      width = naturalWidth;
    }

    this.actor.width = 3;
    this.actor.show();
    Tweener.addTween (this.actor, {
      width: width,
      time: BUTTON_BOX_ANIMATION_TIME,
      transition: "easeOutQuad"
    });
  },

  hide: function(animate) {
    if (!animate)
    {
      this.actor.hide();
      return;
    }

    this.oldWidth = this.actor.width;
    Tweener.addTween(this.actor, {
      width: 2,
      time: BUTTON_BOX_ANIMATION_TIME,
      transition: "easeOutQuad",
      onCompleteScope: this,
      onComplete: function() {
        this.actor.hide();
      }
    });
  }
};

function Dock()
{
  this._init();
}

Dock.prototype = {
  _init: function() {
    this._tracker = Cinnamon.WindowTracker.get_default();
    this.settings = new Settings.ExtensionSettings(this, UUID);
    // Load Settings
    this.position = this.settings.getValue("position");
    this.icon_size = this.settings.getValue("size");
    this.dock_autohide = hideDock = hideable = 
        this.settings.getValue("autohide");
    this.hide_effect = this.settings.getValue("hide-effect");
    this.hide_effect_duration = this.settings.getValue("hide-effect-duration");
    this._displayMonitor = this.settings.getValue("monitor");
    this.enable_hover_peek = this.settings.getValue("enable-hover-peek");

    this._spacing = 4;
    this._item_size = this.icon_size;
    this._nicons = 0;

    this._selectFunctionsHide();

    this.actor = new St.BoxLayout( {
      style_class: 'switcher-list', style: 'padding: 0px', reactive: true
    });
    if (this.position == PositionMode.LEFT ||
        this.position == PositionMode.RIGHT)
      this.actor.set_vertical(true);

    this._grid = new Cinnamon.GenericContainer();
    this.actor.add(this._grid, { expand: true, x_align: St.Align.START,
      y_align: St.Align.START
    });

    this._styleChangedId = this.actor.connect('style-changed',
        Lang.bind(this, this._onStyleChanged));

    this._getPreferredWidthId = this._grid.connect('get-preferred-width',
        Lang.bind(this, this._getPreferredWidth));
    this._getPreferredHeightId = this._grid.connect('get-preferred-height',
        Lang.bind(this, this._getPreferredHeight));
    this._allocateId = this._grid.connect('allocate',
        Lang.bind(this, this._allocate));

    this._workId = Main.initializeDeferredWork(this.actor,
        Lang.bind(this, this._redisplay));

    // For 'app-state-changed' handling in order to limit number of
    // unneeded refreshes
    this._appsNative;
    this._appsAppended;
    this._allApps;
    this._allAppsActors;

    this._appSystem = Cinnamon.AppSystem.get_default();
    this._installedChangedId = this._appSystem.connect('installed-changed',
        Lang.bind(this, this._queueRedisplay));
    this._appFavoritesChangedId = global.settings.connect(
        'changed::favorite-apps', Lang.bind(this, this._queueRedisplay));
    this._appStateChangedId = this._appSystem.connect('app-state-changed',
        Lang.bind(this, this._onAppStateChanged));

    this._overviewShowingId =
        Main.overview.connect('showing', Lang.bind(this, function()
            {
              this.actor.hide();
            }));
    this._overviewHiddenId =
        Main.overview.connect('hidden', Lang.bind(this, function()
            {
              this.actor.show();
            }));

    this._expoShowingId =
        Main.expo.connect('showing', Lang.bind(this, function()
            {
              this.actor.hide();
            }));
    this._expoHiddenId =
        Main.expo.connect('hidden', Lang.bind(this, function()
            {
              this.actor.show();
            }));

    this._demandsAttentionId =
        global.display.connect('window-demands-attention',
            Lang.bind(this, this._onWindowDemandsAttention));
    this._markedUrgentId =
        global.display.connect('window-marked-urgent',
            Lang.bind(this, this._onWindowDemandsAttention));

    // This triggers _redisplay()
    Main.layoutManager.addChrome(this.actor, {
      affectsStruts: !this.dock_autohide });

    // Dock settings submenu on middle mouse click
    this._menu = new DockMenu(this, this.getPopupMenuOrientation());
    this._menuManager = new PopupMenu.PopupMenuManager(this);
    this._menuManager.addMenu(this._menu);
    this._buttonReleaseEventId = this.actor.connect('button-release-event',
        Lang.bind(this, this._onButtonRelease));

    if (this.settings) {
      this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
              "position", "position", this.on_position_changed, null);

      this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
              "size", "icon_size", this.on_icon_size_changed, null);

      this.settings.bindProperty(Settings.BindingDirection.IN,
              "monitor", "_displayMonitor",
              function() {
                this._redisplay();
              }, null);

      this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
              "autohide", "dock_autohide", this.on_autohide_changed, null);

      this.settings.bindProperty(Settings.BindingDirection.IN,
              "hide-effect", "hide_effect",
              this.on_hide_effect_changed, null);

      this.settings.bindProperty(Settings.BindingDirection.IN,
              "hide-effect-duration",
              "hide_effect_duration",
               this.on_hide_effect_duration_changed, null);

      this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
              "enable-hover-peek", "enable_hover_peek",
              this.on_preview_settings_changed, null);

      this.settings.bindProperty(Settings.BindingDirection.IN,
              "hover-peek-opacity",
              "hover_peek_opacity",
              this.on_preview_settings_changed,
              null);

      this.settings.bindProperty(Settings.BindingDirection.IN,
              "hover-peek-time",
              "hover_peek_time",
              this.on_preview_settings_changed,
              null);
    }
    this.menuOpen = false;
    this._leaveEventId =
        this.actor.connect('leave-event',
            Lang.bind(this, function() {
              if(!this.menuOpen)
                this._hideDock();
            }));
    this._enterEventId =
        this.actor.connect('enter-event', Lang.bind(this, this._showDock));
  },

  on_position_changed: function() {
    let primary = Main.layoutManager.primaryMonitor;
    if (this._displayMonitor > -1 &&
        this._displayMonitor < Main.layoutManager.monitors.length) {
      primary = Main.layoutManager.monitors[this._displayMonitor];
    }

    switch (this.position) {
    case PositionMode.TOP:
    case PositionMode.BOTTOM:
      this.actor.x = primary.x;
      break;
    case PositionMode.LEFT:
    case PositionMode.RIGHT:
    default:
      this.actor.y = primary.y;
    }
    this._redisplay();
  },

  on_icon_size_changed: function() {
    this._redisplay();
    if (this._menu) {
      this._menu.refreshIconSize();
    }
  },

  on_autohide_changed: function() {
    Main.layoutManager.removeChrome(this.actor);
    Main.layoutManager.addChrome(this.actor, {
      affectsStruts: !this.dock_autohide});
    hideable = this.dock_autohide;
    if (this.dock_autohide) {
      hideDock = false;
      this._hideDock();
    } else {
      hideDock = true;
      this._showDock();
    }
    if(this._menu) {
      this._menu.refreshHideable();
    }
    this._queueRedisplay();
  },

  on_hide_effect_changed: function() {
    this.actor.disconnect(this._leaveEventId);
    this.actor.disconnect(this._enterEventId);
    this._selectFunctionsHide();
    switch (this.hide_effect) {
      case AutoHideEffect.RESCALE:
        this._item_size = this.icon_size;
        break;
      case AutoHideEffect.RESIZE:
        this.actor.set_scale(1, 1);
    }
    this._leaveEventId =
        this.actor.connect('leave-event',
            Lang.bind(this, function() {
                if (!this.menuOpen)
                  this._hideDock();
            }));
    this._enterEventId =
        this.actor.connect('enter-event',
            Lang.bind(this, this._showDock));
    this._redisplay();
  },

  on_hide_effect_duration_changed: function() {
    // Nothing for now?
  },

  on_preview_settings_changed: function() {
    if (this._menu) {
      this._menu.refreshPreviews();
    }
  },

  getOriginFromWindow: function(metaWindow) {
    let app = Cinnamon.WindowTracker.get_default().get_window_app(metaWindow);
    let index = this._allApps.indexOf(app.get_id());
    return this._allAppsActors[index];
  },

  _onWindowDemandsAttention: function(display, window) {
    let index = this._allApps.indexOf(this._tracker.
        get_window_app(window).get_id());
    if (index > -1) {
      this._allAppsActors[index].
          add_style_class_name("window-list-item-demands-attention");
    }
  },

  _onButtonRelease: function(actor, event) {
    if (event.get_button() == 3) {
      this._disableHideDock();
      this._menu.toggle();
      return true;
    }
    return false;
  },

  destroy: function() {
    if (this._styleChangedId) {
      this.actor.disconnect(this._styleChangedId);
      this._styleChangedId = 0;
    }

    if (this._getPreferredWidthId) {
      this._grid.disconnect(this._getPreferredWidthId);
      this._getPreferredWidthId = 0;
    }

    if (this._getPreferredHeightId) {
      this._grid.disconnect(this._getPreferredHeightId);
      this._getPreferredHeightId = 0;
    }

    if (this._allocateId) {
      this._grid.disconnect(this._allocateId);
      this._allocateId = 0;
    }

    if (this._appStateChangedId) {
      this._appSystem.disconnect(this._appStateChangedId);
      this._appStateChangedId = 0;
    }

    if (this._installedChangedId) {
      this._appSystem.disconnect(this._installedChangedId);
      this._installedChangedId = 0;
    }

    if (this._appFavoritesChangedId) {
      global.settings.disconnect(this._appFavoritesChangedId);
      this._appFavoritesChangedId = 0;
    }

    this._appSystem = null;

    if (this._overviewShowingId) {
      Main.overview.disconnect(this._overviewShowingId);
      this._overviewShowingId = 0;
    }

    if (this._overviewHiddenId) {
      Main.overview.disconnect(this._overviewHiddenId);
      this._overviewHiddenId = 0;
    }

    if (this._expoShowingId) {
      Main.expo.disconnect(this._expoShowingId);
      this._expoShowingId = 0;
    }

    if (this._expoHiddenId) {
      Main.expo.disconnect(this._expoHiddenId);
      this._expoHiddenId = 0;
    }

    if (this._buttonReleaseEventId) {
      this.actor.disconnect(this._buttonReleaseEventId);
      this._buttonReleaseEventId = 0;
    }

    if (this._leaveEventId) {
      this.actor.disconnect(this._leaveEventId);
      this._leaveEventId = 0;
    }

    if (this._enterEventId) {
      this.actor.disconnect(this._enterEventId);
      this._enterEventId = 0;
    }

    this.removeAll();
    this._grid.destroy();
    this.actor.destroy();

    this.settings.finalize();

    this._menu.destroyDockMenu();
    this._menu = null;
    this._menuManager = null;
  },

  // Hiding functions
  _restoreHideDock: function() {
    hideable = this.dock_autohide;
  },

  _disableHideDock: function() {
    hideable = false;
  },

  _selectFunctionsHide: function() {
    switch (this.hide_effect) {
      case AutoHideEffect.RESCALE:
        this._hideDock = hideDock_scale;
        this._showDock = showDock_scale;
        this._initShowDock = initShowDock_scale;
        this._showEffectAddItem = showEffectAddItem_scale;
        break;
      case AutoHideEffect.RESIZE:
      default:
        this._hideDock = hideDock_size;
        this._showDock = showDock_size;
        this._initShowDock = initShowDock_size;
        this._showEffectAddItem = showEffectAddItem_size;
    }
  },

  _appIdListToHash: function(apps) {
    let ids = { };
    for (let i = 0; i < apps.length; i++)
      ids[apps[i].get_id()] = apps[i];
    return ids;
  },

  _onAppStateChanged: function() {
    if (typeof this._appsNative == "undefined")
      return;// Dock._redisplay hasn't run yet

    // We aim to keep refreshing (_queueRedisplay()) minimal
    let running = this._appSystem.get_running();
    let runningAppended = [];
    for (let i = 0; i < running.length; i++) {
      let runningId = running[i].get_id();
      if (runningId in this._appsNative) {
        // Don't refresh - let DockIcon handle changes
      } else {
        // Keep track of apps appended to dock, opening/closing any of
        // them should trigger a refresh
        runningAppended.push(runningId);
      }
    }
    // Only refresh when application which appends to dock either
    // opens or closes
    if (runningAppended.length != this._appsAppended.length) {
      this._queueRedisplay();
    }
  },

  _queueRedisplay: function() {
    Main.queueDeferredWork(this._workId);
  },

  _redisplay: function() {
    this.removeAll();
    this._appsNative = {};
    this._appsAppended = [];

    let appSys = Cinnamon.AppSystem.get_default();
    let ids = global.settings.get_strv(DOCK_APPS_KEY);
    let apps = ids.map(function(id) {
           let app = appSys.lookup_app(id);
           if (!app) app = appSys.lookup_settings_app(id);
             return app;
        }).filter(function(app) {
          return app != null;
        });
    let favorites = { };
    for (let i = 0; i < apps.length; i++) {
      let app = apps[i];
      favorites[app.get_id()] = app;
    }

    let running = appSys.get_running();
    let runningIds = this._appIdListToHash(running);

    let icons = 0;
    let nFavorites = 0;

    this._allApps = [];
    this._allAppsActors = [];
    for (let id in favorites) {
      let app = favorites[id];
      let display = new DockIcon(app, this, true);
      // true: already pinned to dock
      this.addItem(display.actor);
      this._appsNative[app.get_id()] = 0;// Only keys are of interest
      this._allApps.push(app.get_id());
      nFavorites++;
      icons++;
    }

    for (let i = running.length - 1; i >= 0; i--) {
      let app = running[i];
      if (app.get_id()in favorites)
        continue;
      let display = new DockIcon(app, this, false);
      // false: can be pinned to dock if needed
      icons++;
      this.addItem(display.actor);
      this._appsAppended.push(app.get_id());
      this._allApps.push(app.get_id());
    }

    this._nicons = icons;

    let primary = Main.layoutManager.primaryMonitor;
    if (this._displayMonitor > -1 &&
        this._displayMonitor < Main.layoutManager.monitors.length) {
      primary = Main.layoutManager.monitors[this._displayMonitor];
    }
    switch (this.position) {
    case PositionMode.TOP:
    case PositionMode.BOTTOM:
      if (this.actor.x != primary.x) {
        if (hideable && hideDock) {
          this._hideDock();
        } else {
          if (this.icon_size == this._item_size) {
            // Only add/delete icon
            this._showEffectAddItem();
          } else {
            // Change size icon
            this._showDock();
          }
        }
      } else {// Dock starts for a first time or position changed
        this._initShowDock();
        if (hideable) {
          this._hideDock();
        }
      }
      break;
    case PositionMode.LEFT:
    case PositionMode.RIGHT:
    default:
      if (this.actor.y != primary.y) {
        if (hideable && hideDock) {
          this._hideDock();
        } else {
          if (this.icon_size == this._item_size) {
            // Only add/delete icon
            this._showEffectAddItem();
          } else {
            // Change size icon
            this._showDock();
          }
        }
      } else {
        // Dock starts for a first time or position changed
        this._initShowDock();
        if (hideable) {
          this._hideDock();
        }
      }
    }

    if (this._menu) {
      this._menu.refreshPositionSubMenu();
    }
  },

  _getPreferredWidth: function(grid, forHeight, alloc) {
    switch (this.position) {
    case PositionMode.TOP:
    case PositionMode.BOTTOM:
      let children = this._grid.get_children();
      let nCols = children.length;
      let totalSpacing = Math.max(0, nCols - 1) * this._spacing;
      let width = nCols * this._item_size + totalSpacing;
      alloc.min_size = width;
      alloc.natural_size = width;
      break;
    case PositionMode.LEFT:
    case PositionMode.RIGHT:
    default:
      alloc.min_size = this._item_size;
      alloc.natural_size = this._item_size + this._spacing;
    }
  },

  _getPreferredHeight: function(grid, forWidth, alloc) {
    switch (this.position) {
    case PositionMode.TOP:
    case PositionMode.BOTTOM:
      alloc.min_size = this._item_size;
      alloc.natural_size = this._item_size + this._spacing;
      break;
    case PositionMode.LEFT:
    case PositionMode.RIGHT:
    default:
      let children = this._grid.get_children();
      let nRows = children.length;
      let totalSpacing =
          Math.max(0, nRows - 1) * this._spacing;
      let height = nRows * this._item_size + totalSpacing;
      alloc.min_size = height;
      alloc.natural_size = height;
    }
  },

  _allocate: function(grid, box, flags) {
    let children = this._grid.get_children();
    let x = 0;
    let y = 0;
    switch (this.position) {
    case (PositionMode.TOP):
      x = box.x1 + this._spacing;
      y = box.y1 + 2 * this._spacing;
      for (let i = 0; i < children.length; i++) {
        let childBox = new Clutter.ActorBox();
        childBox.x1 = x;
        childBox.y1 = y;
        childBox.x2 = childBox.x1 + this._item_size;
        childBox.y2 = childBox.y1 + this._item_size;
        children[i].allocate(childBox, flags);
        x += this._item_size + this._spacing;
      }
      break;
    case (PositionMode.BOTTOM):
      x = box.x1 + this._spacing;
      y = box.y1 + this._spacing;
      for (let i = 0; i < children.length; i++) {
        let childBox = new Clutter.ActorBox();
        childBox.x1 = x;
        childBox.y1 = y;
        childBox.x2 = childBox.x1 + this._item_size;
        childBox.y2 = childBox.y1 + this._item_size;
        children[i].allocate(childBox, flags);
        x += this._item_size + this._spacing;
      }
      break;
    case (PositionMode.LEFT):
      x = box.x1 + 2 * this._spacing;
      y = box.y1 + this._spacing;

      for (let i = 0; i < children.length; i++) {
        let childBox = new Clutter.ActorBox();
        childBox.x1 = x;
        childBox.y1 = y;
        childBox.x2 = childBox.x1 + this._item_size;
        childBox.y2 = childBox.y1 + this._item_size;
        children[i].allocate(childBox, flags);
        y += this._item_size + this._spacing;
      }
      break;
    case (PositionMode.RIGHT):
    default:
      x = box.x1 + this._spacing;
      y = box.y1 + this._spacing;

      for (let i = 0; i < children.length; i++) {
        let childBox = new Clutter.ActorBox();
        childBox.x1 = x;
        childBox.y1 = y;
        childBox.x2 = childBox.x1 + this._item_size;
        childBox.y2 = childBox.y1 + this._item_size;
        children[i].allocate(childBox, flags);
        y += this._item_size + this._spacing;
      }
    }
  },

  _onStyleChanged: function() {
    let themeNode = this.actor.get_theme_node();
    let[success, len] = themeNode.get_length('spacing', false);
    if (success)
      this._spacing = len;
    this._grid.queue_relayout();
  },

  removeAll: function() {
    this._grid.get_children().forEach(Lang.
        bind(this, function(child) {
          // child.destroy();
          child.emit('destroy')
          // Let DockIcon handle destroying its actors
        }));
  },

  addItem: function(actor) {
    this._grid.add_actor(actor);
    this._allAppsActors.push(actor);
  },

  getPopupMenuOrientation: function() {
    // Orientation 0 is down, 1 is left, 2 top, 3 right
    let orientation = 1; 
    // Assuming default dock is on RIGHT, bubble should popup on LEFT
    switch (this.position) {
    case (PositionMode.TOP):
      orientation = 0;
      break;
    case (PositionMode.BOTTOM):
      orientation = 2;
      break;
    case (PositionMode.LEFT):
      orientation = 3;
      break;
    }
    return orientation;
  }
};

Signals.addSignalMethods(Dock.prototype);

/*
 * start of right-click menu for dock 
 */
function DockPopupMenu()
{
  this._init.apply(this, arguments);// See PopupMenu
}

// Override open/close of PopupMenu
DockPopupMenu.prototype = {
  __proto__: PopupMenu.PopupMenu.prototype,

  setArrowSide: function(side) {
    this._boxPointer._arrowSide = side;
  },

  open: function(animate) {
    if (this.isOpen)
      return;

    this.isOpen = true;

    this._boxPointer.setPosition(this.sourceActor, 0.5);
    this._boxPointer.show(animate);

    this.emit('open-state-changed', true);
  },

  close: function(animate) {
    if (!this.isOpen)
      return;

    if (this._activeMenuItem)
      this._activeMenuItem.setActive(false);

    this._boxPointer.hide(animate);

    // Need to reset hide flag on dock when ESC is hit
    // We either deal with Dock or DockIcon but both reference dock by dockRef
    this._dockRef._restoreHideDock();
    this._dockRef._hideDock();

    this.isOpen = false;
    this.emit('open-state-changed', false);
  }
};

// Dock related menu, handle docks settings.
function DockMenu(dock, orientation)
{
  this._init(dock, orientation);
}

DockMenu.prototype = {
  __proto__: DockPopupMenu.prototype,

  _init: function(dock, orientation) {
    this._dockRef = dock;

    DockPopupMenu.prototype._init.call(this, dock.actor, 0.0, orientation, 0);
    Main.uiGroup.add_actor(this.actor);
    this.actor.hide();

    this.titleMenuItem = new PopupMenu.PopupImageMenuItem(_("Settings"),
        "preferences-system");
    this.titleMenuItem.actor.add_style_class_name('popup-subtitle-menu-item');
    this._onSettingsLaunchedId =
        this.titleMenuItem.connect('activate', Lang.bind(this, function () {
          this.actor.hide();
          Util.spawnCommandLine("cinnamon-settings extensions " + UUID);
          return true;
        }));
    this.addMenuItem(this.titleMenuItem);

    this.separator1 = new PopupMenu.PopupSeparatorMenuItem();
    this.addMenuItem(this.separator1);

    this.iconSizeLabel =
        new PopupMenu.PopupAlternatingMenuItem(_("Icon size") +
            ": " + this._dockRef.icon_size + " " + _("pixels"),
            {reactive: false});
    this.addMenuItem(this.iconSizeLabel);
    this.iconSizeSlider =
        new PopupMenu.PopupSliderMenuItem(
            (this._dockRef.icon_size - MIN_ICON_SIZE) /
            (MAX_ICON_SIZE - MIN_ICON_SIZE));
    this._onIconSizeChangeId = this.iconSizeSlider.connect('value-changed',
        Lang.bind(this, this._onIconSizeChange));
    this.refreshIconSize();
    this.addMenuItem(this.iconSizeSlider);

    this.positionSubMenu =
        new PopupMenu.PopupSubMenuMenuItem(_("Position"));
    this.refreshPositionSubMenu();
    this.addMenuItem(this.positionSubMenu);

    this.hideableSwitch =
        new PopupMenu.PopupSwitchMenuItem(_("Autohide"), hideable);
    this.addMenuItem(this.hideableSwitch);
    this._onHideableChangeId =
        this.hideableSwitch.connect('activate',
            Lang.bind(this, this._onHideableChange));

    this.previewsSwitch =
        new PopupMenu.PopupSwitchMenuItem(_("Show window previews"),
            this._dockRef.enable_hover_peek);
    this.addMenuItem(this.previewsSwitch);
    this._onPreviewsChangeId =
        this.previewsSwitch.connect('activate',
            Lang.bind(this, this._onPreviewsChange));
  },

  _onHideableChange: function(actor, event) {
    this._dockRef.dock_autohide = !hideable;
    this._dockRef.on_autohide_changed();
    return true;
  },

  _onIconSizeChange: function(slider, value) {
    this._dockRef.icon_size =
      Math.floor(value * (MAX_ICON_SIZE - MIN_ICON_SIZE) + MIN_ICON_SIZE);
    this.iconSizeLabel.updateText(_("Icon size") +
            ": " + this._dockRef.icon_size + " " + _("pixels"));
    this._dockRef._redisplay();
    return true;
  },

  _onPreviewsChange: function(actor, event) {
    this._dockRef.enable_hover_peek = this.previewsSwitch.state;
    return true;
  },

  refreshHideable: function() {
    this.hideableSwitch.setToggleState(hideable);
  },

  refreshIconSize: function() {
    this.iconSizeSlider.setValue((this._dockRef.icon_size - MIN_ICON_SIZE) /
      (MAX_ICON_SIZE - MIN_ICON_SIZE));
    this.iconSizeLabel.updateText(_("Icon size") +
      ": " + this._dockRef.icon_size + " " + _("pixels"));
  },

  refreshPreviews: function() {
    this.previewsSwitch.setToggleState(this._dockRef.enable_hover_peek);
  },

  refreshPositionSubMenu: function() {
    this.disconnectPositionSubMenu();
    this._connIds =[];

    this.positionSubMenu.menu.removeAll();
    for (let key in PositionMode) {
      let positionItem =
          new PopupMenu.PopupMenuItem(key.toLowerCase());
      if (PositionMode[key] == this._dockRef.position) {
        positionItem.setShowDot(true);
      }
      positionItem.connId =
          positionItem.connect('activate',
             Lang.bind(this,
                 function(actor, event) {
                 // Position text is inside
                 // StLabel object wrapped
                 // in GenericContainer
                 this._dockRef.position =
                 PositionMode[event.get_source().
                 get_children_list().
                 shift().get_text().toUpperCase()];
                 this._dockRef.on_position_changed();
                 }
             ));
      this.positionSubMenu.menu.addMenuItem(positionItem);
      this._connIds.push(positionItem);
    }
    // Likely dock is repositioned, need to adjust arrow for settings submenu
    this.setArrowSide(this._dockRef.getPopupMenuOrientation());
  },

  disconnectHideableMenu: function() {
    if (this._onIconSizeChangeId) {
      this.iconSizeSlider.disconnect(this._onIconSizeChangeId);
    }
    if (this._onHideableChangeId) {
      this.hideableSwitch.disconnect(this._onHideableChangeId);
    }
    if (this._onPreviewsChangeId) {
      this.previewsSwitch.disconnect(this._onPreviewsChangeId);
    }
  },

  disconnectPositionSubMenu: function() {
    if (this._connIds) {
      while (this._connIds.length > 0) {
        let positionItem = this._connIds.pop();
        if (positionItem) {
          positionItem.disconnect(positionItem.connId);
        }
      }
    }
  },

  disconnectAll: function() {
    if (this._onSettingsLaunchedId) {
      this.titleMenuItem.disconnect(this._onSettingsLaunchedId);
    }

    this.disconnectHideableMenu();
    this.disconnectPositionSubMenu();
  },

  destroyDockMenu: function() {
    this.disconnectAll();
    this.positionSubMenu.menu.destroy();
    this.destroy();
  }
};

function PopupTitleMenuItem() {
  this._init.apply(this, arguments);
}

PopupTitleMenuItem.prototype = {
  __proto__: PopupMenu.PopupBaseMenuItem.prototype,

  _init: function(text, icon, parentMenu, isRunning, params) {
    PopupMenu.PopupBaseMenuItem.prototype._init.call(this,
      {reactive: isRunning});

    this._parentMenu = parentMenu;
    this.boxLayout = new St.BoxLayout({vertical: false});
    this.iconBin = new St.Bin({style_class: 'popup-menu-icon'});
    this.icon = icon;
    this.iconBin.set_child(this.icon);
    this.boxLayout.add(this.iconBin);
    this.label = new St.Label({ text: text, style: 'padding: 3px;' });
    this.label.add_style_class_name('popup-subtitle-menu-item');
    this.boxLayout.add(this.label);
    this.addActor(this.boxLayout, { align: St.Align.MIDDLE, span: 2});
    if (isRunning) {
      let close_icon = new St.Icon({ icon_name: 'window-close',
          icon_type: St.IconType.SYMBOLIC, style_class: 'popup-menu-icon' });
      this.close_button = new St.Button({ child: close_icon, reactive: true });
      this._closeId = this.close_button.connect('clicked',
        Lang.bind(this, function() {
          this._parentMenu._quitApp();
        }));

      this.boxLayout.add(this.close_button, { align: St.Align.END });
    }
  }
};

// DockIcon related menu, currently 'Pin to dock', 'Remove' 
// can be extended to add Close app etc 
function DockIconMenu(dockIcon, orientation)
{
  this._init(dockIcon, orientation);
}

DockIconMenu.prototype = {
  __proto__: DockPopupMenu.prototype,

  _init: function(dockIcon, orientation) {
    this._dockRef = dockIcon._dock;
    this._dockIcon = dockIcon;

    this.previewBox = new Cinnamon.GenericContainer({name: 'altTabPopup',
       visible: false, reactive: true});

    this.previewBox.connect('get-preferred-width',
        Lang.bind(this, this._getPreferredWidth));
    this.previewBox.connect('get-preferred-height',
        Lang.bind(this, this._getPreferredHeight));

    Main.uiGroup.add_actor(this.previewBox);

    DockPopupMenu.prototype._init.call(this, dockIcon.actor, 0.0,
               orientation, 0);

    Main.uiGroup.add_actor(this.actor);
    this.actor.hide();
    this._iconEnterId = this._dockIcon.actor.connect('enter-event',
        Lang.bind(this, this._onEnter));
    this._iconLeaveId = this._dockIcon.actor.connect('leave-event',
        Lang.bind(this, this._onLeave));

    this._enterId = this.actor.connect('enter-event', Lang.bind(this,
        this._onMenuEnter));
    this._leaveId = this.actor.connect('leave-event', Lang.bind(this,
        this._onMenuLeave));

    // Keep track of signal connections so you can clean them up easily
    this._conns = [];
  },

  _getPreferredWidth: function(actor, forHeight, alloc) {
    alloc.min_size = global.screen_width;
    alloc.natural_size = global.screen_width;
  },

  _getPreferredHeight: function(actor, forWidth, alloc) {
    alloc.min_size = global.screen_height;
    alloc.natural_size = global.screen_height;
  },

  _hoverPeek: function(opacity, metaWin) {
    if (!this._dockRef.enable_hover_peek) return;

    let time = this._dockRef.hover_peek_time;

    let showPreview = function() {
      this._displayPreviewTimeoutId = null;
      let childBox = new Clutter.ActorBox();

      let lastClone = null;
      let previewClones = [];
      let window = metaWin;
      let clones = createWindowClone(window, null, true, false);
      for (let i = 0; i < clones.length; i++) {
        let clone = clones[i];
        previewClones.push(clone.actor);

        this.previewBox.add_actor(clone.actor);
        let [width, height] = clone.actor.get_size();
        childBox.x1 = clone.x;
        childBox.x2 = clone.x + width;
        childBox.y1 = clone.y;
        childBox.y2 = clone.y + height;
        clone.actor.allocate(childBox, 0);
        clone.actor.lower(this.actor);
        if (lastClone) {
          lastClone.lower(clone.actor);
        }
        lastClone = clone.actor;
      }
 
      this._clearPreview();
      this._previewClones = previewClones;
      this.previewBox.show();
    };// show preview

    global.get_window_actors().forEach(function(window_actor) {
      var meta_win = window_actor.get_meta_window();
      if (meta_win.get_window_type() != Meta.WindowType.DESKTOP)
        Tweener.addTween(window_actor, {
          time: time * 0.001,
          transition: 'easeOutQuad',
          opacity: opacity * 2.55,
        });
    });
    if (!this._previewClones) {
      let delay = time * 0.001;
      this._displayPreviewTimeoutId = Mainloop.timeout_add(delay,
        Lang.bind(this, showPreview));
    }
    else this._clearPreview();
  },

  _clearPreview: function() {
    let time = this._dockRef.hover_peek_time;
    if (this._previewClones) {
      for (let i = 0; i < this._previewClones.length; ++i) {
        let clone = this._previewClones[i];
        Tweener.addTween(clone, {
          opacity: 0,
          time: time * 0.001,
          transition: 'linear',
          onCompleteScope: this,
          onComplete: function() {
            this.previewBox.remove_actor(clone);
            clone.destroy();
          }
        });
      }
    }
    this._previewClones = null;
  },

  _clearHoverPeek: function() {
    if (!this._dockRef.enable_hover_peek)
      return;

    let time = this._dockRef.hover_peek_time;
    this._clearPreview();
    this.previewBox.hide();
    global.get_window_actors().forEach(function (window_actor) {
      var metaWin = window_actor.get_meta_window();
      if (metaWin.get_window_type() != Meta.WindowType.DESKTOP)
        Tweener.addTween(window_actor, {
          time: time * 0.001,
          transition: 'easeOutQuad',
          opacity: 255,
        });
    });
  },

  _redisplay: function() {
    // Disconnect all signals before removing menu items
    this._disconnectAll();
    this.removeAll();

    this.activated = false;
    let windows = this._dockIcon.app.get_windows();

    let icon = this._dockIcon.app.create_icon_texture(APPLICATION_ICON_SIZE);
    let titleItem = new PopupTitleMenuItem(this._dockIcon.app.get_name(), icon,
        this, this._dockIcon._getRunning());
    titleItem.connectId = titleItem.connect('activate', Lang.bind(this,
        function() {
          this._dockIcon.app.activate_window(null, global.get_current_time());
        }));
    this._conns.push(titleItem);
    this.addMenuItem(titleItem);
    if (!this._dockIcon.app.is_window_backed()) {
      let item = new PopupMenu.PopupMenuItem(_("New Window"));
      this.addMenuItem(item);
      item.connectId = item.connect('activate',
          Lang.bind(this, this._onNewWindow));
      this._conns.push(item);
    }
    let separator = new PopupMenu.PopupSeparatorMenuItem();
    this.addMenuItem(separator);

    // Display the app windows menu items and the separator between
    // windows of the current desktop and other windows.
    let activeWorkspace = global.screen.get_active_workspace();
    let separatorShown = windows.length > 0
        && windows[0].get_workspace() != activeWorkspace;

    for (let i = 0; i < windows.length; i++) {
      if (!separatorShown
          && windows[i].get_workspace() != activeWorkspace) {
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.addMenuItem(separator);
        separatorShown = true;
      }
      let demanding = windows[i].is_demanding_attention()
          || windows[i].is_urgent();
      let item;
      if (windows[i].minimized)
        item = new PopupMenu.PopupAlternatingMenuItem("[" +
          windows[i].get_title().substr(0, TITLE_LENGTH) +
          (windows[i].get_title().length <= TITLE_LENGTH ? "" : "...") + "]");
      else
        item = new PopupMenu.PopupAlternatingMenuItem(windows[i].get_title().
          substr(0, TITLE_LENGTH) +
          (windows[i].get_title().length <= TITLE_LENGTH ? "" : "..."));
      if (demanding)
        item.actor.add_style_class_name('popup-subtitle-menu-item');

      let close_icon = new St.Icon({ icon_name: 'window-close',
          icon_type: St.IconType.SYMBOLIC, style_class: 'popup-menu-icon' });
      let close_button = new St.Button({ child: close_icon });
      close_button.connectId = close_button.connect('clicked',
        Lang.bind(this, function(){           
          item._window.delete(global.get_current_time());
          this._clearHoverPeek(); 
          this.emit('leave-event');
          this.close(true);
        }));
      this._conns.push(close_button);
      item.addActor(close_button, { align: St.Align.END });
      this.addMenuItem(item);
      item._window = windows[i];
      item._updateTitleId = windows[i].connect('notify::title',
        Lang.bind(this, function() {
          if (item._window.minimized)
            item.updateText("[" +
              item._window.get_title().substr(0, TITLE_LENGTH) +
              (item._window.get_title().length <= TITLE_LENGTH ? "" : "...")
              + "]", true);
          else
            item.updateText(item._window.get_title().substr(0, TITLE_LENGTH) +
              (item._window.get_title().length <= TITLE_LENGTH ? "" : "..."),
              true);
        }));

      item._enterId = item.actor.connect('enter-event',
        Lang.bind(this, function() {
          this._hoverPeek(this._dockRef.hover_peek_opacity, item._window);
          if (item._window.minimized) {
            item._window.unminimize();
            item.wasMinimized = true;
          } else item.wasMinimized = false;
        }));
      item._leaveId = item.actor.connect('leave-event',
        Lang.bind(this, function() {
	  this._clearHoverPeek();
          if (item.wasMinimized && !this.activated) {
            item._window.minimize(global.get_current_time());
          }
        }));
      item.connectId =
          item.connect('activate', Lang.bind(this, this._onActivateWindow));
      this._conns.push(item);
    }

    if (windows.length > 0) {
      let separator = new PopupMenu.PopupSeparatorMenuItem();
      this.addMenuItem(separator);
    }

    if (this._dockIcon._isPinned) {
      // Already pinned, we cannot pin it again but we may wish to remove it
      let item = new PopupMenu.PopupMenuItem(_('Remove from favorites'));
      this.addMenuItem(item);
      item.connectId = item.connect('activate',
          Lang.bind(this, this._onRemove));
      this._conns.push(item);
    } else {
      let item = new PopupMenu.PopupMenuItem(_('Add to favorites'));
      this.addMenuItem(item);
      item.connectId =
          item.connect('activate', Lang.bind(this, this._onPinToDock));
      this._conns.push(item);
    }
  },

  _quitApp: function() {
    this.shouldOpen = false;
    this.shouldClose = true;
    this.hoverClose();
    this._dockIcon.app.request_quit();
  },

  _onEnter: function() {
    if (!this._dockRef._menu.isOpen) {
      this.shouldOpen = true;
      this.shouldClose = false;
      this._redisplay();

      this._onEnterId =
        Mainloop.timeout_add(ENTER_TIMEOUT, Lang.bind(this, this.hoverOpen));
    }
  },

  _onLeave: function() {
    this.shouldClose = true;
    this.shouldOpen = false;

    this._onLeaveId =
      Mainloop.timeout_add(LEAVE_TIMEOUT, Lang.bind(this, this.hoverClose));
  },

  _onMenuEnter: function() {
    this.shouldOpen = true;
    this.shouldClose = false;

    this._onMenuEnterId =
      Mainloop.timeout_add(ENTER_TIMEOUT, Lang.bind(this, this.hoverOpen));
  },

  _onMenuLeave: function() {
    this.shouldClose = true;
    this.shouldOpen = false;

    this._onMenuLeaveId =
      Mainloop.timeout_add(LEAVE_TIMEOUT, Lang.bind(this, this.hoverClose));
  },

  hoverOpen: function() {
    if (this.shouldOpen && !this.isOpen) {
      this._dockRef.menuOpen = true;
      this.open(true);
      this._dockIcon._onStateChanged();
    }
  },

  hoverClose: function() {
    if (this.shouldClose) {
      this._dockRef.menuOpen = false;
      this.close(true);
      this._dockIcon._onStateChanged();
    }
  },

  _onNewWindow: function(actor, event) {
    this._dockIcon._animateIcon(0);
    this._dockIcon.app.open_new_window(-1);
  },

  _onActivateWindow: function(actor, event) {
    Main.activateWindow(actor._window);
    this.activated = true;
    this._onActivateId =
      Mainloop.timeout_add(LEAVE_TIMEOUT,
          Lang.bind(this, this._clearHoverPeek));
  },

  _onPinToDock: function(actor, event) {
    let appid = this._dockIcon.app.get_id();
    let ids = global.settings.get_strv(DOCK_APPS_KEY);
    ids.push(appid);
    global.settings.set_strv(DOCK_APPS_KEY, ids);
    this._dockIcon._dock._queueRedisplay();
  },

  _onRemove: function(actor, event) {
    let appid = this._dockIcon.app.get_id();
    let ids = global.settings.get_strv(DOCK_APPS_KEY);
    let i = ids.indexOf(appid);
    if (i >= 0) {
      ids.splice(i, 1);
      global.settings.set_strv(DOCK_APPS_KEY, ids);
      this._dockIcon._dock._queueRedisplay();
    }
  },

  _disconnectAll: function() {
    // Is this necessary?  Does it cause problems?
    /*
    if (this._onEnterId)
      Mainloop.source_remove(this._onEnterId);
    if (this._onLeaveId)
      Mainloop.source_remove(this._onLeaveId);
    if (this._onMenuEnterId)
      Mainloop.source_remove(this._onMenuEnterId);
    if (this._onMenuLeaveId)
      Mainloop.source_remove(this._onMenuLeaveId);
    if (this._onActivateId)
      Mainloop.source_remove(this._onActivateId);
    */

    while (this._conns.length > 0) {
      let item = this._conns.pop();
      if (item) {
        item.disconnect(item.connectId);
        if (item._enterId > 0) {
          item.actor.disconnect(item._enterId);
          item._enterId = 0;
        }
        if (item._leaveId > 0) {
          item.actor.disconnect(item._leaveId);
          item._leaveId = 0;
        }
        if (item._updateTitleId > 0) {
          item._window.disconnect(item._updateTitleId);
          item._updateTitleId = 0;
        }
      }
    }
  },

  destroyDockIconMenu: function() {
    // Why does including this cause bugs?
    /*if (this._iconEnterId > 0) {
      this._dockIcon.disconnect(this._iconEnterId);
      this._iconEnterId = 0;
    }
    if (this._iconLeaveId > 0) {
      this._dockIcon.disconnect(this._iconLeaveId);
      this._iconLeaveId = 0;
    }
    if (this._enterId > 0) {
      this.actor.disconnect(this._enterId);
      this._enterId = 0;
    }
    if (this._leaveId > 0) {
      this.actor.disconnect(this._leaveId);
      this._leaveId = 0;
    }*/
    this._disconnectAll();
    this.destroy();
  }
};

function DockIcon(app, dock, isPinned)
{
  this._init(app, dock, isPinned);
}

DockIcon.prototype = {
  _init: function(app, dock, isPinned) {
    this.app = app;
    this._dock = dock;
    this._isPinned = isPinned;

    this.actor = new St.Bin( { style_class: 'panel-launcher',
        style: 'padding: 0px;',
        x_fill: true, y_fill: true,
        can_focus: true, reactive: true, track_hover: true} );
    this.actor._delegate = this;
    this.actor.set_size(this._dock.icon_size, this._dock.icon_size);
    this.actor.demands_attention = false;

    this._icon = this.app.create_icon_texture(Math.floor(this._dock.icon_size
        * ICON_HEIGHT_FACTOR));
    this._iconButton = new SuperscriptIconButton(this._icon);
    this.actor.set_child(this._iconButton.actor);

    this._menuManager = new PopupMenu.PopupMenuManager(this);
    this._menu =
        new DockIconMenu(this, this._dock.getPopupMenuOrientation());
    this._menuManager.addMenu(this._menu);
    this.updateSuperscript();

    this._buttonReleaseEventId =
        this.actor.connect('button-release-event',
            Lang.bind(this, this._onButtonRelease));
    this._actorDestroyId =
        this.actor.connect('destroy',
            Lang.bind(this, this._onDestroy));

    this._tracker = Cinnamon.WindowTracker.get_default();
    this._focusAppId =
        this._tracker.connect('notify::focus-app',
            Lang.bind(this, this._onStateChanged));
    this._workspaces = [];
    this._winAddedId = [];
    this._winRemovedId = [];
    for (let i = 0; i < global.screen.n_workspaces; i++) {
      let metaWorkspace = global.screen.get_workspace_by_index(i);
      this._workspaces[i] = metaWorkspace;
      this._winAddedId[i] = this._workspaces[i].connect_after
          ('window-added', Lang.bind(this, this.updateSuperscript));
      this._winRemovedId[i] = this._workspaces[i].connect_after
          ('window-removed', Lang.bind(this, this.updateSuperscript));
    }
    this._workspaceAddedId = global.screen.connect('workspace-added',
        Lang.bind(this, function(screen, index) {
          let metaWorkspace = global.screen.get_workspace_by_index(index);
          this._workspaces.push(metaWorkspace);
          this._winAddedId.push(metaWorkspace.connect_after('window-added',
            Lang.bind(this, this.updateSuperscript)));
          this._winRemovedId.push(metaWorkspace.connect_after('window-removed',
            Lang.bind(this, this.updateSuperscript)));
        }));
    this._workspaceRemovedId = global.screen.connect('workspace-removed',
        Lang.bind(this, function(screen, index) {
          let metaWorkspace = global.screen.get_workspace_by_index(index);
          let removedYet = false;
          for (let i = 0; i < this._workspaces.length && !removedYet; i++) {
            if (this._workspaces[i] == metaWorkspace) {
              this._workspaces[i].disconnect(this._winAddedId[i]);
              this._workspaces[i].disconnect(this._winRemovedId[i]);
              this._workspaces.splice(i, 1);
              this._winAddedId.splice(i, 1);
              this._winRemovedId.splice(i, 1);
              removedYet = true;
            }
          }
        }));
    this._stateChangedId = this.app.connect('notify::state',
        Lang.bind(this, this._onStateChanged));
    this._onStateChanged();
  },

  _onDestroy: function() {
    // Note: not setting all of these to zero when disconnecting was causing
    // the dock apparently not to destroy completely, thus causing the
    // extension to misbehave when reloading from Looking Glass and flipping
    // the autohide flag. The signal ids I didn't zero were the window and
    // workspace added/removed flags.
    for (let i = 0; i < this._workspaces.length; i++) {
      if (this._winAddedId[i] > 0) {
        this._workspaces[i].disconnect(this._winAddedId[i]);
        this._winAddedId[i] = 0;
      }
      if (this._winRemovedId[i] > 0) {
        this._workspaces[i].disconnect(this._winRemovedId[i]);
        this._winRemovedId[i] = 0;
      }
    }

    if (this._workspaceAddedId > 0) {
      global.screen.disconnect(this._workspaceAddedId);
      this._workspaceAddedId = 0;
    }

    if (this._workspaceRemovedId > 0) {
      global.screen.disconnect(this._workspaceRemovedId);
      this._workspaceRemovedId = 0;
    }

    if (this._buttonReleaseEventId > 0) {
      this.actor.disconnect(this._buttonReleaseEventId);
      this._buttonReleaseEventId = 0;
    }

    if (this._actorDestroyId > 0) {
      this.actor.disconnect(this._actorDestroyId);
      this._actorDestroyId = 0;
    }

    if (this._focusAppId > 0) {
      this._tracker.disconnect(this._focusAppId);
      this._focusAppId = 0;
    }

    if (this._stateChangedId > 0) {
      this.app.disconnect(this._stateChangedId);
      this._stateChangedId = 0;
    }

    this._menu.destroyDockIconMenu();
    this._menu = null;
    this._menuManager = null;

    this.actor.destroy();
  },

  _onStateChanged: function() {
    this.updateSuperscript();
    let tracker = Cinnamon.WindowTracker.get_default();
    let focusedApp = tracker.focus_app;
    if (this._getRunning()) {
      if (this.actor.get_style_class_name() != 'window-list-item-box')
        this.actor.set_style_class_name('window-list-item-box');
      this.actor.demands_attention = false;
      let wins = this.app.get_windows();
      let doneYet = false;
      for (let i = 0; i < wins.length && !doneYet; i++ ) {
        if (wins[i].is_demanding_attention() || wins[i].is_urgent()) {
          this.actor.demands_attention = true;
          doneYet = true;
        }
      }
      if (this.actor.demands_attention)
        this.actor.add_style_class_name('window-list-item-demands-attention');
      else
        this.actor.remove_style_class_name
            ('window-list-item-demands-attention');
      if (this.app == focusedApp) {
        this.actor.add_style_pseudo_class('focus');
      } else {
        this.actor.remove_style_pseudo_class('focus');
      }
    } else {
      this.actor.set_style_class_name('panel-launcher');
      this.actor.remove_style_pseudo_class('focus');
    }
  },

  _onButtonRelease: function(actor, event) {
    let retVal = false;
    let dockMenuWasOpen = false;
    // If dock settings menu is open then close it first no matter what button
    if (this._dock._menu.isOpen) {
      this._dock._menu.toggle();
      dockMenuWasOpen = true;
      retVal = true;
    }

    if (this._menu.isOpen) {
      this._menu.toggle();
      retVal = true;
    }

    let button = event.get_button();
    if (button == 1) {
      this._onActivate(Clutter.get_current_event());
      retVal = true;
    } else if (button == 3) {
      if (!this._dock._menu.isOpen && !dockMenuWasOpen) {
        this._dock._menu.toggle();
        this._dock._menu.isOpen = true;
        retVal = true;
      }
    }
    return retVal;
  },

  _animateIcon: function(step) {
    if (step>=3) return;
    Tweener.addTween(this._icon, {
      width: this._dock.icon_size * ICON_ANIM_FACTOR,
      height: this._dock.icon_size * ICON_ANIM_FACTOR,
      time: ICON_ANIM_STEP_TIME,
      transition: 'easeOutQuad',
      onComplete: function(){
        Tweener.addTween(this._icon, {
          width: Math.floor(this._dock.icon_size * ICON_HEIGHT_FACTOR),
          height: Math.floor(this._dock.icon_size * ICON_HEIGHT_FACTOR),
          time: ICON_ANIM_STEP_TIME,
          transition: 'easeOutQuad',
          onComplete: function(){
            this._animateIcon(step+1);
          },
          onCompleteScope: this
        });
      },
      onCompleteScope: this
    });
  },

  updateSuperscript: function() {
    this._menu._redisplay();
    let winLen = this.app.get_windows().length;
    if (winLen > 1) this._iconButton.setWindowNum(winLen.toString());
    else this._iconButton.setWindowNum("");
  },

  getId: function() {
    return this.app.get_id();
  },

  _getRunning: function() {
    return this.app.state != Cinnamon.AppState.STOPPED;
  },

  _onActivate: function(event) {
    this.emit('launching');
    let modifiers = Cinnamon.get_event_state(event);

    if (this.app.state != Cinnamon.AppState.RUNNING)
      this._animateIcon(0);

    if (modifiers & Clutter.ModifierType.CONTROL_MASK
        && this.app.state == Cinnamon.AppState.RUNNING) {
      let current_workspace = global.screen.get_active_workspace().index();
      this._animateIcon(0);
      this.app.open_new_window(current_workspace);
    } else {
      let tracker = Cinnamon.WindowTracker.get_default();
      let focusedApp = tracker.focus_app;

      if (this.app == focusedApp) {
        let windows = this.app.get_windows();
        let current_workspace = global.screen.get_active_workspace();
        for (let i = 0; i < windows.length; i++) {
          let w = windows[i];
          if (w.get_workspace() == current_workspace)
            w.minimize();
        }
      } else {
        this.app.activate(-1);
      }
    }
  }
};

Signals.addSignalMethods(DockIcon.prototype);

let dock;
function init(extensionMeta)
{
}

function enable()
{
  dock = new Dock();
}

function disable()
{
  dock.destroy();
  dock = null;
}
