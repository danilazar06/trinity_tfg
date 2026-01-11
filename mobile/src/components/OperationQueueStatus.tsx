/**
 * Operation Queue Status Component
 * Shows queue status and pending operations to users
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useOperationQueue } from '../hooks/useOperationQueue';

interface OperationQueueStatusProps {
  showDetails?: boolean;
  style?: any;
}

export const OperationQueueStatus: React.FC<OperationQueueStatusProps> = ({
  showDetails = false,
  style
}) => {
  const { stats, operations, isProcessing, clearQueue, forceProcess } = useOperationQueue();

  if (stats.totalOperations === 0) {
    return null; // Don't show anything if queue is empty
  }

  const handleClearQueue = () => {
    Alert.alert(
      'Limpiar Cola',
      '¿Estás seguro de que quieres eliminar todas las operaciones pendientes?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Limpiar', 
          style: 'destructive',
          onPress: clearQueue
        }
      ]
    );
  };

  const getOperationTypeLabel = (type: string) => {
    switch (type) {
      case 'VOTE': return 'Voto';
      case 'JOIN_ROOM': return 'Unirse a sala';
      case 'CREATE_ROOM': return 'Crear sala';
      case 'LEAVE_ROOM': return 'Salir de sala';
      case 'UPDATE_FILTERS': return 'Actualizar filtros';
      default: return type;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return '#ff4444';
      case 'MEDIUM': return '#ffaa00';
      case 'LOW': return '#44aa44';
      default: return '#666666';
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          📝 Operaciones Pendientes ({stats.totalOperations})
        </Text>
        {isProcessing && (
          <Text style={styles.processing}>Procesando...</Text>
        )}
      </View>

      <View style={styles.stats}>
        <Text style={styles.statText}>
          Pendientes: {stats.pendingOperations} | 
          Reintentando: {stats.failedOperations}
        </Text>
      </View>

      {showDetails && operations.length > 0 && (
        <View style={styles.operationsList}>
          {operations.slice(0, 3).map((operation) => (
            <View key={operation.id} style={styles.operationItem}>
              <View style={styles.operationInfo}>
                <Text style={styles.operationType}>
                  {getOperationTypeLabel(operation.type)}
                </Text>
                <View style={styles.operationMeta}>
                  <View 
                    style={[
                      styles.priorityDot, 
                      { backgroundColor: getPriorityColor(operation.priority) }
                    ]} 
                  />
                  <Text style={styles.retryCount}>
                    {operation.retryCount > 0 && `Reintentos: ${operation.retryCount}`}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          {operations.length > 3 && (
            <Text style={styles.moreOperations}>
              +{operations.length - 3} más...
            </Text>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={forceProcess}
          disabled={isProcessing}
        >
          <Text style={styles.actionButtonText}>
            {isProcessing ? 'Procesando...' : 'Reintentar Ahora'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.clearButton]}
          onPress={handleClearQueue}
        >
          <Text style={[styles.actionButtonText, styles.clearButtonText]}>
            Limpiar
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    margin: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  processing: {
    fontSize: 12,
    color: '#007bff',
    fontStyle: 'italic',
  },
  stats: {
    marginBottom: 8,
  },
  statText: {
    fontSize: 12,
    color: '#666',
  },
  operationsList: {
    marginBottom: 8,
  },
  operationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  operationInfo: {
    flex: 1,
  },
  operationType: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  operationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  retryCount: {
    fontSize: 11,
    color: '#666',
  },
  moreOperations: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    flex: 1,
    marginHorizontal: 2,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  clearButton: {
    backgroundColor: '#dc3545',
  },
  clearButtonText: {
    color: 'white',
  },
});

export default OperationQueueStatus;