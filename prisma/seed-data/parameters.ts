export type SeedParameter = {
  key: string;
  name: string;
  unit?: string;
  dataType?: "number" | "string";
  /** Must be equal for a form-fit-function drop-in. */
  critical?: boolean;
};

export const PARAMETERS: SeedParameter[] = [
  // Generic electrical
  { key: "capacitance", name: "Capacitance", unit: "F", critical: true },
  { key: "resistance", name: "Resistance", unit: "Ω", critical: true },
  { key: "inductance", name: "Inductance", unit: "H", critical: true },
  { key: "voltage", name: "Rated voltage", unit: "V", critical: true },
  { key: "tolerance", name: "Tolerance", unit: "%", critical: true },
  { key: "dielectric", name: "Dielectric", dataType: "string", critical: true },
  { key: "power", name: "Power rating", unit: "W", critical: true },
  { key: "current", name: "Current rating", unit: "A", critical: true },
  { key: "isat", name: "Saturation current", unit: "A" },
  { key: "impedance", name: "Impedance @100 MHz", unit: "Ω", critical: true },
  { key: "frequency", name: "Frequency", unit: "Hz", critical: true },
  { key: "load_cap", name: "Load capacitance", unit: "F" },
  { key: "stability", name: "Frequency stability", unit: "ppm" },
  { key: "tempco", name: "Temperature coefficient", unit: "ppm/°C" },
  { key: "esr", name: "ESR", unit: "Ω" },
  { key: "lifetime", name: "Lifetime @ temp", dataType: "string" },
  { key: "temp_range", name: "Operating temperature", dataType: "string" },
  // Semis
  { key: "core", name: "Core", dataType: "string", critical: true },
  { key: "clock", name: "Max clock", unit: "Hz" },
  { key: "flash", name: "Flash", unit: "B" },
  { key: "ram", name: "RAM", unit: "B" },
  { key: "io", name: "GPIO count", dataType: "number" },
  { key: "logic_cells", name: "Logic cells / LEs", dataType: "number" },
  { key: "memory_type", name: "Memory type", dataType: "string", critical: true },
  { key: "density", name: "Density", unit: "bit", critical: true },
  { key: "mem_interface", name: "Memory interface", dataType: "string", critical: true },
  { key: "topology", name: "Topology", dataType: "string", critical: true },
  { key: "vin_max", name: "Input voltage (max)", unit: "V" },
  { key: "vout", name: "Output voltage", unit: "V", critical: true },
  { key: "iout", name: "Output current", unit: "A" },
  { key: "channels", name: "Channels", dataType: "number" },
  { key: "gbw", name: "Gain bandwidth", unit: "Hz" },
  { key: "resolution", name: "Resolution", unit: "bit", critical: true },
  { key: "sample_rate", name: "Sample rate", unit: "SPS" },
  { key: "protocol", name: "Protocol", dataType: "string", critical: true },
  { key: "data_rate", name: "Data rate", unit: "bps" },
  { key: "supply", name: "Supply voltage", dataType: "string" },
  { key: "radio", name: "Radio", dataType: "string", critical: true },
  { key: "sensor_type", name: "Sensor type", dataType: "string", critical: true },
  { key: "polarity", name: "Polarity / type", dataType: "string", critical: true },
  { key: "vds", name: "Vds / Vce (max)", unit: "V", critical: true },
  { key: "id", name: "Id / Ic (max)", unit: "A" },
  { key: "rds_on", name: "Rds(on)", unit: "Ω" },
  { key: "vr", name: "Reverse voltage", unit: "V", critical: true },
  { key: "if", name: "Forward current", unit: "A" },
  { key: "vz", name: "Zener / breakdown voltage", unit: "V", critical: true },
  { key: "color", name: "Colour", dataType: "string", critical: true },
  { key: "isolation", name: "Isolation voltage", unit: "V" },
  { key: "ctr", name: "CTR", dataType: "string" },
  // Electromechanical
  { key: "positions", name: "Positions", dataType: "number", critical: true },
  { key: "pitch", name: "Pitch", unit: "m", critical: true },
  { key: "series", name: "Series", dataType: "string", critical: true },
  { key: "orientation", name: "Orientation", dataType: "string" },
  { key: "contact_rating", name: "Contact rating", unit: "A" },
  { key: "coil_voltage", name: "Coil voltage", unit: "V", critical: true },
  { key: "switch_type", name: "Switch type", dataType: "string" },
  { key: "ip_rating", name: "IP rating", dataType: "string" },
  // Cables & mechanical
  { key: "awg", name: "Wire gauge", dataType: "string", critical: true },
  { key: "conductors", name: "Conductors", dataType: "number" },
  { key: "insulation", name: "Insulation / standard", dataType: "string" },
  { key: "material", name: "Material", dataType: "string" },
  { key: "dimensions", name: "Dimensions", dataType: "string" },
  { key: "thread", name: "Thread", dataType: "string" },
];
