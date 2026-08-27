import { useMemo, useState } from 'react';
import {
  ProveedorMaterialFormData,
  Cantera,
  CanteraFormData,
  CanteraMaterialFormData,
  CanteraMaterialCampo,
  ConversionDireccion,
  CONVERSION_DIRECCION_LABELS,
  CONVERSION_DIRECCION_AYUDA,
  ProveedorMaterialTipo,
  PROVEEDOR_MATERIAL_TIPO_LABELS,
} from '../types';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { useMateriales, formatMaterialType, materialOptions } from '@/modules/materiales';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { Plus, Trash2, ChevronDown, ChevronUp, Building2, Users } from 'lucide-react';
import { ECUADOR_LOCATIONS } from '@/shared/constants/ecuador-locations';

const TIPO_OPTIONS: {
  value: ProveedorMaterialTipo;
  icon: typeof Building2;
  descripcion: string;
}[] = [
  { value: 'INTERNO', icon: Building2, descripcion: 'Cantera o material propio de la empresa' },
  { value: 'EXTERNO', icon: Users, descripcion: 'Proveedor de un tercero' },
];

const DIRECCIONES_CONVERSION: ConversionDireccion[] = ['TN_A_M3', 'M3_A_TN'];

const esPositivo = (n: number) => Number.isFinite(n) && n > 0;

/** Deja el resultado con hasta 3 decimales, sin ceros de relleno (5.714, 1.4, 8) */
const formatearNumero = (n: number) => String(Number(n.toFixed(3)));

/**
 * Aplica el factor en el sentido elegido. El campo de origen y el factor se
 * editan; el de destino se calcula y queda vacío si falta algún dato.
 *
 *   TN → M³:  M³ = TN ÷ factor
 *   M³ → TN:  TN = M³ × factor
 */
const recalcularMaterial = (material: CanteraMaterialFormData): CanteraMaterialFormData => {
  const siguiente = { ...material };
  const tn = parseFloat(siguiente.toneladas);
  const m3 = parseFloat(siguiente.metrosCubicos);
  const factor = parseFloat(siguiente.factor);

  if (siguiente.direccionConversion === 'TN_A_M3') {
    siguiente.metrosCubicos =
      esPositivo(tn) && esPositivo(factor) ? formatearNumero(tn / factor) : '';
  } else {
    siguiente.toneladas =
      esPositivo(m3) && esPositivo(factor) ? formatearNumero(m3 * factor) : '';
  }

  return siguiente;
};

/**
 * Al invertir el sentido, el valor calculado pasa a ser el de entrada. Nunca
 * se borra nada: si al nuevo origen le falta dato, se dejan los valores como están.
 */
const cambiarDireccionConversion = (
  material: CanteraMaterialFormData,
  direccionConversion: ConversionDireccion
): CanteraMaterialFormData => {
  const siguiente = { ...material, direccionConversion };
  const tn = parseFloat(siguiente.toneladas);
  const m3 = parseFloat(siguiente.metrosCubicos);
  const factor = parseFloat(siguiente.factor);
  if (!esPositivo(factor)) return siguiente;

  if (direccionConversion === 'TN_A_M3' && esPositivo(tn)) {
    siguiente.metrosCubicos = formatearNumero(tn / factor);
  } else if (direccionConversion === 'M3_A_TN' && esPositivo(m3)) {
    siguiente.toneladas = formatearNumero(m3 * factor);
  }

  return siguiente;
};

/** Normaliza una cantera tal como la devuelve el backend al formato de texto del formulario */
const canteraToFormData = (c: Cantera): CanteraFormData => ({
  // Sin el id, el backend borraría la cantera y la recrearía, perdiendo su
  // historial de despachos y las planificaciones que la tengan asignada.
  id: c.id,
  nombre: c.nombre,
  provincia: c.provincia || '',
  canton: c.canton || '',
  direccion: c.direccion || '',
  materiales: (c.materiales || []).map((m) => ({
    materialId: m.materialId,
    toneladas: m.toneladas != null ? String(m.toneladas) : '',
    metrosCubicos: m.metrosCubicos != null ? String(m.metrosCubicos) : '',
    factor:
      m.factor != null
        ? String(m.factor)
        : m.toneladas && m.metrosCubicos
          ? formatearNumero(m.toneladas / m.metrosCubicos)
          : '',
    direccionConversion: m.direccionConversion || 'TN_A_M3',
  })),
});

/** Cantera existente en cualquier proveedor, para el buscador de reasignación */
export interface CanteraExistente extends Cantera {
  proveedorNombre?: string;
}

interface ProveedorMaterialFormProps {
  /** Las canteras llegan tal cual las devuelve el backend; el form las normaliza a texto */
  initialData?: Partial<Omit<ProveedorMaterialFormData, 'canteras'>> & { canteras?: Cantera[] };
  /** Todas las canteras ya registradas (de cualquier proveedor), para poder reasignarlas en vez de crear una nueva */
  canterasExistentes?: CanteraExistente[];
  onSubmit: (data: ProveedorMaterialFormData) => Promise<void>;
  onCancel: () => void;
}

export const ProveedorMaterialForm = ({
  initialData,
  canterasExistentes,
  onSubmit,
  onCancel,
}: ProveedorMaterialFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState<ProveedorMaterialFormData>({
    ruc: initialData?.ruc || '',
    razonsocial: initialData?.razonsocial || '',
    nombreComercial: initialData?.nombreComercial || '',
    tipo: initialData?.tipo || '',
    email: initialData?.email || '',
    provincia: initialData?.provincia || '',
    canton: initialData?.canton || '',
    direccion: initialData?.direccion || '',
    canteras: (initialData?.canteras || []).map(canteraToFormData),
  });

  const { materiales, isLoading: isLoadingMateriales, error: errorMateriales } = useMateriales();

  const materialNameById = useMemo(
    () => new Map(materiales.map((m) => [m.id, formatMaterialType(m.materialType)])),
    [materiales]
  );

  const getMaterialName = (id: number) => materialNameById.get(id) || `Material #${id}`;

  const [availableCantones, setAvailableCantones] = useState<string[]>(
    initialData?.provincia && initialData.provincia in ECUADOR_LOCATIONS
      ? ECUADOR_LOCATIONS[initialData.provincia as keyof typeof ECUADOR_LOCATIONS]
      : []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'provincia') {
      const cantones = value in ECUADOR_LOCATIONS ? ECUADOR_LOCATIONS[value as keyof typeof ECUADOR_LOCATIONS] : [];
      setAvailableCantones(cantones);
      setFormData((prev) => ({ ...prev, provincia: value, canton: '' }));
    }
  };

  const handleAddCantera = () => {
    setFormData((prev) => {
      const newIndex = prev.canteras.length;
      setExpandedIndex(newIndex);
      return {
        ...prev,
        canteras: [
          ...prev.canteras,
          {
            nombre: '',
            provincia: prev.provincia || '',
            canton: prev.canton || '',
            direccion: '',
            materiales: [],
          },
        ],
      };
    });
  };

  // Ya agregada a este proveedor en este mismo formulario: no la vuelve a ofrecer.
  const idsYaAgregados = useMemo(
    () => new Set(formData.canteras.map((c) => c.id).filter((id): id is number => id != null)),
    [formData.canteras]
  );

  const canterasDisponibles = useMemo(
    () => (canterasExistentes || []).filter((c) => c.id != null && !idsYaAgregados.has(c.id)),
    [canterasExistentes, idsYaAgregados]
  );

  const canteraExistenteOptions = useMemo(
    () =>
      canterasDisponibles.map((c) => ({
        value: String(c.id),
        label: c.proveedorNombre ? `${c.nombre} — ${c.proveedorNombre}` : c.nombre,
      })),
    [canterasDisponibles]
  );

  /** Trae una cantera ya registrada (de este u otro proveedor) en vez de crearla de cero */
  const handleAddCanteraExistente = (canteraId: number) => {
    const cantera = canterasDisponibles.find((c) => c.id === canteraId);
    if (!cantera) return;
    setFormData((prev) => {
      const newIndex = prev.canteras.length;
      setExpandedIndex(newIndex);
      return { ...prev, canteras: [...prev.canteras, canteraToFormData(cantera)] };
    });
  };

  const handleRemoveCantera = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      canteras: prev.canteras.filter((_, i) => i !== index),
    }));
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const handleCanteraChange = (index: number, field: keyof Omit<CanteraFormData, 'materiales'>, value: string) => {
    setFormData((prev) => {
      const updatedCanteras = [...prev.canteras];
      updatedCanteras[index] = { ...updatedCanteras[index], [field]: value };
      return { ...prev, canteras: updatedCanteras };
    });
  };

  /** Reemplaza la lista de materiales de una cantera aplicando `updater` */
  const updateCanteraMateriales = (
    canteraIndex: number,
    updater: (materiales: CanteraFormData['materiales']) => CanteraFormData['materiales']
  ) => {
    setFormData((prev) => {
      const updatedCanteras = [...prev.canteras];
      updatedCanteras[canteraIndex] = {
        ...updatedCanteras[canteraIndex],
        materiales: updater(updatedCanteras[canteraIndex].materiales),
      };
      return { ...prev, canteras: updatedCanteras };
    });
  };

  const handleAddMaterial = (canteraIndex: number, materialId: number) => {
    if (!materialId) return;
    updateCanteraMateriales(canteraIndex, (materiales) =>
      materiales.some((m) => m.materialId === materialId)
        ? materiales
        : [
            ...materiales,
            { materialId, toneladas: '', metrosCubicos: '', factor: '', direccionConversion: 'TN_A_M3' as ConversionDireccion },
          ]
    );
  };

  const handleRemoveMaterial = (canteraIndex: number, materialId: number) => {
    updateCanteraMateriales(canteraIndex, (materiales) =>
      materiales.filter((m) => m.materialId !== materialId)
    );
  };

  const handleMaterialValueChange = (
    canteraIndex: number,
    materialId: number,
    field: CanteraMaterialCampo,
    value: string
  ) => {
    // Solo números con hasta 3 decimales (o campo vacío)
    if (value !== '' && !/^\d*\.?\d{0,3}$/.test(value)) return;
    updateCanteraMateriales(canteraIndex, (materiales) =>
      materiales.map((m) =>
        m.materialId === materialId ? recalcularMaterial({ ...m, [field]: value }) : m
      )
    );
  };

  const handleDireccionChange = (
    canteraIndex: number,
    materialId: number,
    direccionConversion: ConversionDireccion
  ) => {
    updateCanteraMateriales(canteraIndex, (materiales) =>
      materiales.map((m) =>
        m.materialId === materialId ? cambiarDireccionConversion(m, direccionConversion) : m
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="pb-6 border-b border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tipo de Proveedor
        </label>
        <p className="text-sm text-gray-500 mb-3">
          Seleccione si el proveedor pertenece a la empresa (interno) o es un tercero (externo).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TIPO_OPTIONS.map(({ value, icon: Icon, descripcion }) => {
            const isSelected = formData.tipo === value;
            return (
              <label
                key={value}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={value}
                  checked={isSelected}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div>
                  <span className={`flex items-center gap-2 text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    <Icon className="w-4 h-4" />
                    {PROVEEDOR_MATERIAL_TIPO_LABELS[value]}
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">{descripcion}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="RUC"
          name="ruc"
          value={formData.ruc}
          onChange={handleChange}
          maxLength={13}
          placeholder="0999999999001"
        />
        <Input
          label="Razón Social"
          name="razonsocial"
          value={formData.razonsocial}
          onChange={handleChange}
          placeholder="Materiales S.A."
        />
        <Input
          label="Nombre Comercial"
          name="nombreComercial"
          value={formData.nombreComercial || ''}
          onChange={handleChange}
          placeholder="Materiales CR"
        />
        <Input
          label="Email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="correo@ejemplo.com"
        />
        <Input
          label="Dirección"
          name="direccion"
          value={formData.direccion || ''}
          onChange={handleChange}
          placeholder="Av. Principal"
        />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Provincia</label>
          <select
            name="provincia"
            value={formData.provincia || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccione una provincia</option>
            {Object.keys(ECUADOR_LOCATIONS).map((provincia) => (
              <option key={provincia} value={provincia}>
                {provincia}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Cantón</label>
          <select
            name="canton"
            value={formData.canton || ''}
            onChange={handleChange}
            disabled={!formData.provincia}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">Seleccione un cantón</option>
            {availableCantones.map((canton) => (
              <option key={canton} value={canton}>
                {canton}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
          <h3 className="text-lg font-medium text-gray-900">Canteras del Proveedor</h3>
          <div className="flex items-center gap-2">
            <div className="w-56 sm:w-64">
              <SearchableSelect
                value=""
                disabled={canterasDisponibles.length === 0}
                placeholder={
                  canterasDisponibles.length === 0
                    ? 'No hay canteras existentes'
                    : 'Buscar cantera existente...'
                }
                emptyMessage="Ninguna cantera coincide"
                options={canteraExistenteOptions}
                onChange={(valor) => {
                  if (valor) handleAddCanteraExistente(Number(valor));
                }}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleAddCantera}>
              <Plus className="w-4 h-4 mr-2" />
              Añadir Cantera
            </Button>
          </div>
        </div>

        {formData.canteras.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500">No se han añadido canteras para este proveedor</p>
          </div>
        ) : (
          <div className="space-y-4">
            {formData.canteras.map((cantera, index) => {
              const isExpanded = expandedIndex === index;
              return (
              <div key={index} className="bg-gray-50 rounded-xl border border-gray-200 relative group overflow-visible transition-all duration-300">
                <div
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <div className="flex items-center gap-2 pr-8 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${cantera.nombre ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                      {cantera.nombre || 'Punto de Despacho - Cantera'}
                    </h4>
                    {cantera.materiales.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 shrink-0">
                        {cantera.materiales.length} {cantera.materiales.length === 1 ? 'material' : 'materiales'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCantera(index);
                      }}
                      className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                      title="Eliminar cantera"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                </div>

                <div
                  className={`transition-all duration-300 ease-in-out ${
                    isExpanded ? 'max-h-[1000px] opacity-100 p-4 pt-0' : 'max-h-0 opacity-0 overflow-hidden'
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Punto de Despacho - Cantera"
                      value={cantera.nombre}
                      onChange={(e) => handleCanteraChange(index, 'nombre', e.target.value)}
                      placeholder="Ej: Cantera Norte"
                    />
                  <Input
                    label="Dirección"
                    value={cantera.direccion || ''}
                    onChange={(e) => handleCanteraChange(index, 'direccion', e.target.value)}
                    placeholder="Dirección exacta"
                  />

                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Provincia Cantera</label>
                    <select
                      value={cantera.provincia || ''}
                      onChange={(e) => {
                        handleCanteraChange(index, 'provincia', e.target.value);
                        handleCanteraChange(index, 'canton', '');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccione una provincia</option>
                      {Object.keys(ECUADOR_LOCATIONS).map((provincia) => (
                        <option key={provincia} value={provincia}>
                          {provincia}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Cantón Cantera</label>
                    <select
                      value={cantera.canton || ''}
                      onChange={(e) => handleCanteraChange(index, 'canton', e.target.value)}
                      disabled={!cantera.provincia}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    >
                      <option value="">Seleccione un cantón</option>
                      {(cantera.provincia && cantera.provincia in ECUADOR_LOCATIONS
                        ? ECUADOR_LOCATIONS[cantera.provincia as keyof typeof ECUADOR_LOCATIONS]
                        : []
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="relative z-20 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Materiales que despacha
                        </label>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Elija el sentido de la conversión de cada material: TN → M³ divide
                          por el factor y M³ → TN lo multiplica.
                        </p>
                      </div>
                      {(() => {
                        const disponibles = materiales.filter(
                          (m) => !cantera.materiales.some((cm) => cm.materialId === m.id)
                        );
                        const sinOpciones = isLoadingMateriales || disponibles.length === 0;

                        // Deja claro por qué no hay nada para elegir en lugar de mostrar un select vacío
                        const textoPorDefecto = isLoadingMateriales
                          ? 'Cargando materiales...'
                          : errorMateriales
                            ? 'No se pudieron cargar los materiales'
                            : materiales.length === 0
                              ? 'No hay materiales registrados'
                              : disponibles.length === 0
                                ? 'Ya agregó todos los materiales'
                                : '+ Agregar material';

                        // Buscador y no un select nativo: el catálogo pasa de 60
                        // materiales y varios se parecen entre sí (PIEDRA # 6 /
                        // PIEDRA #6 LAVADA / PIEDRA # 67).
                        return (
                          <div className="sm:w-64 z-20 absolute right-0 bottom-0 sm:static">
                            <SearchableSelect
                              value=""
                              disabled={sinOpciones}
                              placeholder={textoPorDefecto}
                              emptyMessage="Ningún material coincide"
                              options={materialOptions(disponibles)}
                              onChange={(valor) => {
                                if (valor) handleAddMaterial(index, Number(valor));
                              }}
                            />
                          </div>
                        );
                      })()}
                    </div>

                    {cantera.materiales.length === 0 ? (
                      <div className="text-center py-4 bg-white rounded-lg border-2 border-dashed border-gray-300">
                        <p className="text-sm text-gray-500">
                          Aún no se han agregado materiales a este punto de despacho
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Material
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">
                                Convertir
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                                Toneladas (TN)
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                                Metros Cúbicos (M³)
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                                Factor (TN por M³)
                              </th>
                              <th className="px-4 py-2 w-12" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {cantera.materiales.map((cm) => {
                              const tnEsCalculado = cm.direccionConversion === 'M3_A_TN';
                              return (
                                <tr key={cm.materialId}>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                    {getMaterialName(cm.materialId)}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                                      {DIRECCIONES_CONVERSION.map((dir) => (
                                        <button
                                          key={dir}
                                          type="button"
                                          onClick={() => handleDireccionChange(index, cm.materialId, dir)}
                                          title={CONVERSION_DIRECCION_AYUDA[dir]}
                                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                            cm.direccionConversion === dir
                                              ? 'bg-blue-600 text-white'
                                              : 'bg-white text-gray-600 hover:bg-gray-50'
                                          }`}
                                        >
                                          {CONVERSION_DIRECCION_LABELS[dir]}
                                        </button>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={cm.toneladas}
                                      onChange={(e) =>
                                        handleMaterialValueChange(index, cm.materialId, 'toneladas', e.target.value)
                                      }
                                      readOnly={tnEsCalculado}
                                      tabIndex={tnEsCalculado ? -1 : undefined}
                                      placeholder={tnEsCalculado ? '—' : '0.00'}
                                      title={tnEsCalculado ? 'Se calcula automáticamente: M³ × factor' : undefined}
                                      className={`w-full px-2 py-1.5 rounded-lg text-sm text-right tabular-nums ${
                                        tnEsCalculado
                                          ? 'border border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed focus:outline-none'
                                          : 'border border-gray-300 focus:ring-2 focus:ring-blue-500'
                                      }`}
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={cm.metrosCubicos}
                                      onChange={(e) =>
                                        handleMaterialValueChange(index, cm.materialId, 'metrosCubicos', e.target.value)
                                      }
                                      readOnly={!tnEsCalculado}
                                      tabIndex={!tnEsCalculado ? -1 : undefined}
                                      placeholder={!tnEsCalculado ? '—' : '0.00'}
                                      title={!tnEsCalculado ? 'Se calcula automáticamente: TN ÷ factor' : undefined}
                                      className={`w-full px-2 py-1.5 rounded-lg text-sm text-right tabular-nums ${
                                        !tnEsCalculado
                                          ? 'border border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed focus:outline-none'
                                          : 'border border-gray-300 focus:ring-2 focus:ring-blue-500'
                                      }`}
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={cm.factor}
                                      onChange={(e) =>
                                        handleMaterialValueChange(index, cm.materialId, 'factor', e.target.value)
                                      }
                                      placeholder="Ej: 1.4"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMaterial(index, cm.materialId)}
                                      className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                                      title={`Quitar ${getMaterialName(cm.materialId)}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar Proveedor'}
        </Button>
      </div>
    </form>
  );
};
