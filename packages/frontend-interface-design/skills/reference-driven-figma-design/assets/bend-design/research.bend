import Base

# An original research-library example, not a universal adjective-to-style recipe.
# Bindings are illustrative fixtures until inspected editable Figma sources replace them.
# The task selects structure; density is scoped to the collection; energy to the heading.

type Task is Data:
  Read{}
  Compare{}

type Density is Data:
  Dense{}
  Comfortable{}

type Energy is Data:
  Calm{}
  Expressive{}

type Device is Data:
  Desktop{}
  Mobile{}

type Viewport is Data:
  Viewport{width: U32, height: U32}

type Axis is Data:
  Axis{id: String, value: String, scope: String}

type Binding is Data:
  Binding{property: String, content: String}

type Node is Type:
  Stack{id: String, role: String, width: U32, direction: String, gap: String, padding: String, surface: String, children: List<Node>, axes: List<String>, rules: List<String>}
  Asset{id: String, role: String, width: U32, source: String, bindings: List<Binding>, axes: List<String>, rules: List<String>}

type DesignPlan is Type:
  DesignPlan{schema_version: String, viewport: Viewport, state: String, axes: List<Axis>, root: Node}

def viewport(device: Device) -> Viewport:
  match device:
    case Desktop{}:
      Viewport{1280, 900}
    case Mobile{}:
      Viewport{390, 844}

def page_width(device: Device) -> U32:
  match device:
    case Desktop{}:
      1280
    case Mobile{}:
      390

def inner_width(device: Device) -> U32:
  match device:
    case Desktop{}:
      1232
    case Mobile{}:
      358

def page_padding(device: Device) -> String:
  match device:
    case Desktop{}:
      "space.page"
    case Mobile{}:
      "space.page-mobile"

def density_value(density: Density) -> String:
  match density:
    case Dense{}:
      "dense"
    case Comfortable{}:
      "comfortable"

def energy_value(energy: Energy) -> String:
  match energy:
    case Calm{}:
      "quiet"
    case Expressive{}:
      "focal"

def heading_source(energy: Energy) -> String:
  match energy:
    case Calm{}:
      "heading.quiet"
    case Expressive{}:
      "heading.expressive"

def collection_source(task: Task, density: Density) -> String:
  match task density:
    case Read{} Dense{}:
      "reference-list.compact"
    case Read{} Comfortable{}:
      "reference-list.comfortable"
    case Compare{} Dense{}:
      "comparison.compact"
    case Compare{} Comfortable{}:
      "comparison.comfortable"

def collection(task: Task, density: Density, width: U32) -> Node:
  Asset{"collection", "research collection", width, collection_source(task, density), [Binding{"Title", "collection-title"}, Binding{"Items", "references"}], ["density"], ["density-retains-grouping"]}

def detail(width: U32) -> Node:
  Asset{"detail", "selected reference", width, "reference.detail", [Binding{"Title", "detail-title"}, Binding{"Body", "detail-body"}], ["task"], ["read-selected-evidence"]}

def body(task: Task, density: Density, device: Device) -> Node:
  match task device:
    case Read{} Desktop{}:
      Stack{"body", "context and evidence", 1232, "horizontal", "space.page", "space.none", "surface.page", [collection(Read{}, density, 344), detail(864)], ["task"], ["reading-retains-context"]}
    case Read{} Mobile{}:
      Stack{"body", "selected evidence", 358, "vertical", "space.group", "space.none", "surface.page", [detail(358)], ["task"], ["narrow-focuses-selection"]}
    case Compare{} Desktop{}:
      Stack{"body", "compare references", 1232, "vertical", "space.group", "space.none", "surface.page", [collection(Compare{}, density, 1232), Asset{"notes", "comparison guidance", 1232, "comparison.notes", [Binding{"Body", "comparison-notes"}], ["task"], ["compare-before-reading"]}], ["task"], ["comparison-aligns-attributes"]}
    case Compare{} Mobile{}:
      Stack{"body", "compare references", 358, "vertical", "space.group", "space.none", "surface.page", [collection(Compare{}, density, 358), Asset{"notes", "comparison guidance", 358, "comparison.notes", [Binding{"Body", "comparison-notes"}], ["task"], ["compare-before-reading"]}], ["task"], ["comparison-reflows-attributes"]}

def axes(task: Task, density: Density, energy: Energy, device: Device) -> List<Axis>:
  match task device:
    case Read{} Mobile{}:
      [Axis{"task", "reading", "body"}, Axis{"energy", energy_value(energy), "heading"}]
    case Read{} Desktop{}:
      [Axis{"task", "reading", "body"}, Axis{"density", density_value(density), "collection"}, Axis{"energy", energy_value(energy), "heading"}]
    case Compare{} Mobile{}:
      [Axis{"task", "comparison", "body"}, Axis{"density", density_value(density), "collection"}, Axis{"energy", energy_value(energy), "heading"}]
    case Compare{} Desktop{}:
      [Axis{"task", "comparison", "body"}, Axis{"density", density_value(density), "collection"}, Axis{"energy", energy_value(energy), "heading"}]

def generate(+task: Task, +density: Density, +energy: Energy, +device: Device) -> DesignPlan:
  DesignPlan{"1.0", viewport(device), "reference-selected", axes(task, density, energy, device), Stack{"screen", "research library", page_width(device), "vertical", "space.page", page_padding(device), "surface.page", [Asset{"heading", "page heading", inner_width(device), heading_source(energy), [Binding{"Title", "page-title"}, Binding{"Subtitle", "page-subtitle"}], ["energy"], ["concentrate-visual-energy"]}, body(task, density, device)], [], ["calm-shell-dense-content"]}}
