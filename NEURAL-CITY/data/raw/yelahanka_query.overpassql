
[out:json][timeout:60];

(
  way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|living_street)$"]
  (13.0850,77.5750,13.1050,77.6000);

  way["building"]
  (13.0850,77.5750,13.1050,77.6000);
);

out geom;
