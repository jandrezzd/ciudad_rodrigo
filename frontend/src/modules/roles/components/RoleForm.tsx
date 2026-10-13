import { FormEvent, useMemo, useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { Input } from '@/shared/components/Input';
import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Select';
import { Modulo, PermissionMatrixRow, Role, RoleFormData } from '../types';

interface RoleFormProps {
  role?: Role;
  modulos: Modulo[];
  onSubmit: (basics: RoleFormData, permisos: PermissionMatrixRow[]) => Promise<void>;
  onCancel: () => void;
}

const ACCIONES: { key: keyof Omit<PermissionMatrixRow, 'moduloId'>; label: string }[] = [
  { key: 'canView', label: 'Ver' },
  { key: 'canCreate', label: 'Crear' },
  { key: 'canEdit', label: 'Editar' },
  { key: 'canDelete', label: 'Eliminar' },
  { key: 'canToggle', label: 'Activar/Desactivar' },
];

/**
 * Alta y edición de un cargo, con su matriz de permisos por módulo.
 *
 * ADMIN es la única excepción: siempre tiene todo (lo hardcodea el backend),
 * así que su matriz se muestra marcada y deshabilitada — ni vale la pena
 * mandarla al guardar, el backend la rechazaría de todos modos.
 */
export const RoleForm = ({ role, modulos, onSubmit, onCancel }: RoleFormProps) => {
  const esEdicion = Boolean(role);
  const esAdmin = role?.name === 'ADMIN';

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [isActive, setIsActive] = useState(role?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [permisos, setPermisos] = useState<PermissionMatrixRow[]>(() =>
    modulos.map((modulo) => {
      const existente = role?.permissions.find((p) => p.moduloId === modulo.id);
      return {
        moduloId: modulo.id,
        canView: esAdmin || existente?.canView || false,
        canCreate: esAdmin || existente?.canCreate || false,
        canEdit: esAdmin || existente?.canEdit || false,
        canDelete: esAdmin || existente?.canDelete || false,
        canToggle: esAdmin || existente?.canToggle || false,
      };
    })
  );

  const modulosPorId = useMemo(
    () => new Map(modulos.map((m) => [m.id, m])),
    [modulos]
  );

  const setCelda = (moduloId: number, accion: keyof Omit<PermissionMatrixRow, 'moduloId'>, valor: boolean) => {
    setPermisos((prev) =>
      prev.map((fila) => (fila.moduloId === moduloId ? { ...fila, [accion]: valor } : fila))
    );
  };

  const marcarFila = (moduloId: number, valor: boolean) => {
    setPermisos((prev) =>
      prev.map((fila) =>
        fila.moduloId === moduloId
          ? { ...fila, canView: valor, canCreate: valor, canEdit: valor, canDelete: valor, canToggle: valor }
          : fila
      )
    );
  };

  const marcarColumna = (accion: keyof Omit<PermissionMatrixRow, 'moduloId'>, valor: boolean) => {
    setPermisos((prev) => prev.map((fila) => ({ ...fila, [accion]: valor })));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ name, description, isActive }, permisos);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Input
            label="Nombre del cargo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={role?.isSystem}
            required
          />
          {role?.isSystem && (
            <p className="text-xs text-gray-500 dark:text-night-muted mt-1">
              Este cargo es del sistema: su nombre no se puede cambiar.
            </p>
          )}
        </div>
        <Input
          label="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {esEdicion && (
          <Select
            label="Estado"
            options={[
              { value: 'true', label: 'Activo' },
              { value: 'false', label: 'Inactivo' },
            ]}
            value={String(isActive)}
            onChange={(e) => setIsActive(e.target.value === 'true')}
            hideDefaultOption
          />
        )}
      </div>

      {esEdicion && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-night-text">Permisos por módulo</p>
            {esAdmin && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ADMIN siempre tiene acceso total — no se puede editar.
              </p>
            )}
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-night-raised">
                <tr className="text-left text-xs uppercase text-gray-500 dark:text-night-muted">
                  <th className="py-2 px-3">Módulo</th>
                  {ACCIONES.map((accion) => (
                    <th key={accion.key} className="py-2 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>{accion.label}</span>
                        {!esAdmin && (
                          <button
                            type="button"
                            title={`Marcar/desmarcar toda la columna "${accion.label}"`}
                            onClick={() =>
                              marcarColumna(
                                accion.key,
                                !permisos.every((f) => f[accion.key])
                              )
                            }
                            className="text-gray-400 dark:text-night-subtle hover:text-blue-600"
                          >
                            {permisos.every((f) => f[accion.key]) ? (
                              <CheckSquare size={14} />
                            ) : (
                              <Square size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {permisos.map((fila) => {
                  const modulo = modulosPorId.get(fila.moduloId);
                  const filaCompleta = ACCIONES.every((a) => fila[a.key]);
                  return (
                    <tr key={fila.moduloId}>
                      <td className="py-2 px-3 text-gray-900 dark:text-night-text">
                        <button
                          type="button"
                          disabled={esAdmin}
                          onClick={() => marcarFila(fila.moduloId, !filaCompleta)}
                          className="flex items-center gap-1.5 hover:text-blue-600 disabled:hover:text-gray-900 disabled:cursor-default"
                          title="Marcar/desmarcar toda la fila"
                        >
                          {esAdmin ? null : filaCompleta ? (
                            <CheckSquare size={14} className="text-gray-400 dark:text-night-subtle" />
                          ) : (
                            <Square size={14} className="text-gray-400 dark:text-night-subtle" />
                          )}
                          {modulo?.label ?? fila.moduloId}
                        </button>
                      </td>
                      {ACCIONES.map((accion) => (
                        <td key={accion.key} className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={fila[accion.key]}
                            disabled={esAdmin}
                            onChange={(e) => setCelda(fila.moduloId, accion.key, e.target.checked)}
                            className="h-4 w-4"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!esEdicion && (
        <p className="text-xs text-gray-500 dark:text-night-muted">
          Al crear el cargo queda sin ningún permiso — se configura la matriz después, editándolo.
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline"
         className="!bg-blue-200 dark:!bg-blue-500/20 !text-blue-800 dark:!text-blue-300 hover:!bg-blue-300 dark:hover:!bg-blue-500/25 border-none"
        onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {esEdicion ? 'Guardar cambios' : 'Crear cargo'}
        </Button>
      </div>
    </form>
  );
};
