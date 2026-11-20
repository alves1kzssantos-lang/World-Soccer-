extends SceneTree
## Exporta os dados do jogo Godot (World, DataPack) para JSON da versão web.
## Uso (na pasta do projeto Godot):
##   OUT=/caminho/web/public/data godot --headless --path . -s /caminho/web/tools/export_data.gd
func _init() -> void:
	var out := OS.get_environment("OUT")
	if out == "":
		push_error("defina OUT")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(out)
	var leagues: Array = []
	for li in World.LEAGUES.size():
		var lg: Dictionary = World.LEAGUES[li]
		var clubs: Array = []
		for ci in lg["clubs"].size():
			var c: Array = lg["clubs"][ci]
			clubs.append({"name": c[0], "short": c[1], "c1": c[2], "c2": c[3], "str": c[4], "logo": DataPack.pack_id(li, ci)})
		leagues.append({"name": lg["name"], "country": lg["country"], "nat": lg["nat"], "pool": lg["pool"], "prize": lg["prize"],
			"comp_id": DataPack.comp_id(li), "clubs": clubs})
	_write(out + "/leagues.json", leagues)
	_write(out + "/cups.json", World.CUPS)
	_write(out + "/names.json", {"names": World.NAMES, "foreign": World.FOREIGN, "striped": World.STRIPED})
	quit(0)


func _write(path: String, data) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(JSON.stringify(data, "", false))
	f.close()
	print("ok ", path)
