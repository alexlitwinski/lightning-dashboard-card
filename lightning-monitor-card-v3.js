/**
 * Lightning Monitor Card
 * 
 * Autor: Seu Nome
 * Versão: 1.0.0
 * 
 * Um cartão personalizado para Home Assistant que exibe de forma visual
 * os dados de detecção de raios, mostrando distância e força dos raios detectados.
 */

// Editor de configuração
class LightningMonitorCardEditor extends HTMLElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = config || {
      entity: '',
      name: 'Monitor de Raios',
      show_radar: true,
      show_recent: true,
      max_entries: 4
    };
  }

  // Getters para configuração
  get _entity() {
    return this._config.entity || '';
  }

  get _name() {
    return this._config.name || 'Monitor de Raios';
  }

  get _show_radar() {
    return this._config.show_radar !== false;
  }

  get _show_recent() {
    return this._config.show_recent !== false;
  }

  get _max_entries() {
    return this._config.max_entries || 4;
  }

  _valueChanged(ev) {
    if (!this._config) {
      return;
    }
    
    const target = ev.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const configValue = target.configValue || target.getAttribute('config-value');
    
    if (configValue) {
      if (target.type === 'number') {
        this._config = {
          ...this._config,
          [configValue]: parseInt(value),
        };
      } else {
        this._config = {
          ...this._config,
          [configValue]: value,
        };
      }
    }
    
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _getEntities() {
    if (!this.hass) return [];
    
    return Object.keys(this.hass.states)
      .filter(entityId => entityId.startsWith('sensor.') && 
              (entityId.includes('raio') || entityId.includes('lightning') || 
               entityId.includes('thunder') || entityId.includes('trovao')))
      .map(entityId => ({
        value: entityId,
        name: this.hass.states[entityId].attributes.friendly_name || entityId,
      }));
  }

  render() {
    if (!this.hass || !this._config) {
      return html``;
    }

    const entities = this._getEntities();

    return html`
      <div class="card-config">
        <div class="config-row">
          <ha-select
            label="Entidade de Sensor"
            .value=${this._entity}
            @selected=${this._valueChanged}
            config-value="entity"
            required
          >
            <ha-list-item value="">Selecione uma entidade</ha-list-item>
            ${entities.map(entity => html`
              <ha-list-item .value=${entity.value}>${entity.name}</ha-list-item>
            `)}
          </ha-select>
        </div>
        
        <div class="config-row">
          <ha-textfield
            label="Nome do Cartão"
            .value=${this._name}
            @input=${this._valueChanged}
            config-value="name"
          ></ha-textfield>
        </div>
        
        <div class="config-row">
          <ha-formfield label="Mostrar Radar">
            <ha-switch
              .checked=${this._show_radar}
              @change=${this._valueChanged}
              config-value="show_radar"
            ></ha-switch>
          </ha-formfield>
        </div>
        
        <div class="config-row">
          <ha-formfield label="Mostrar Eventos Recentes">
            <ha-switch
              .checked=${this._show_recent}
              @change=${this._valueChanged}
              config-value="show_recent"
            ></ha-switch>
          </ha-formfield>
        </div>
        
        <div class="config-row">
          <ha-textfield
            label="Número Máximo de Eventos"
            type="number"
            min="1"
            max="10"
            .value=${this._max_entries}
            @input=${this._valueChanged}
            config-value="max_entries"
          ></ha-textfield>
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this;
  }
}
customElements.define('lightning-monitor-card-editor', LightningMonitorCardEditor);

// Componente principal
class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
    this.lastDetectedEvent = null;
    this.lastEventTimestamp = 0;
    this.loadedExampleData = false;
    this.config = {
      show_radar: true,
      show_recent: true,
      max_entries: 4
    };
  }

  static getConfigElement() {
    return document.createElement('lightning-monitor-card-editor');
  }

  static getStubConfig() {
    return {
      entity: '',
      distance_entity: '',
      energy_entity: '',
      name: 'Monitor de Raios',
      show_radar: true,
      show_recent: true,
      max_entries: 4
    };
  }

  setConfig(config) {
    // Verifica se pelo menos a entidade principal ou as entidades específicas foram fornecidas
    if (!config.entity && (!config.distance_entity || !config.energy_entity)) {
      throw new Error('Especifique uma entidade sensor de raios ou entidades separadas para distância e energia');
    }
    
    this.config = {
      ...this.config,
      ...config
    };
    
    this.render();
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    // Se for a primeira vez que recebemos o hass, buscar o histórico
    if (!oldHass && hass) {
      this.fetchHistory();
    } else {
      this.updateData();
      this.render();
    }
  }

  // Formatar horário
  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Determinar cor baseada na distância
  getDistanceColor(distance) {
    if (distance < 5) return 'var(--danger-color, #e74c3c)';
    if (distance < 10) return 'var(--warning-color, #f39c12)';
    if (distance < 15) return 'var(--warning-secondary-color, #f1c40f)';
    return 'var(--success-color, #2ecc71)';
  }

  // Determinar classe CSS para ícone baseado na força
  getIconClass(strength) {
    if (strength > 80) return 'icon-large';
    if (strength > 60) return 'icon-medium-large';
    if (strength > 40) return 'icon-medium';
    return 'icon-small';
  }

  updateData() {
    if (!this._hass) return;

    // Verificar modo de operação: entidade única ou entidades separadas
    const useSeparateEntities = this.config.distance_entity && this.config.energy_entity;
    
    try {
      if (useSeparateEntities) {
        // Modo com entidades separadas
        const distanceEntityId = this.config.distance_entity;
        const energyEntityId = this.config.energy_entity;
        
        const distanceObj = this._hass.states[distanceEntityId];
        const energyObj = this._hass.states[energyEntityId];
        
        if (!distanceObj || !energyObj) {
          console.error('Uma ou mais entidades não encontradas');
          return;
        }
        
        // Obter valores atuais
        const distance = parseFloat(distanceObj.state);
        const strength = parseFloat(energyObj.state);
        const now = new Date();
        
        // Inicializar lastEventTimestamp se não existir
        if (!this.lastEventTimestamp) {
          this.lastEventTimestamp = 0;
        }
        
        // Somente registrar um novo evento se:
        // 1. Os valores mudaram significativamente OU
        // 2. Passou um tempo mínimo (30 segundos) desde o último evento
        const currentTimestamp = now.getTime();
        const minTimeDiff = 30000; // 30 segundos em milissegundos
        
        // Verificar mudanças significativas nos valores
        const significantChange = !this.lastDetectedEvent || 
            Math.abs(distance - this.lastDetectedEvent.distance) > 0.5 || 
            Math.abs(strength - this.lastDetectedEvent.strength) > 5;
            
        // Verificar tempo mínimo desde o último evento
        const timeElapsed = currentTimestamp - this.lastEventTimestamp > minTimeDiff;
        
        // Criar novo evento se houver mudança significativa ou tempo suficiente passou
        if (significantChange && timeElapsed) {
          // Gerar um novo evento
          const newEvent = {
            id: currentTimestamp,
            timestamp: now.toISOString(),
            distance: distance,
            strength: strength
          };
          
          // Adicionar ao início do array
          this.lightningData.unshift(newEvent);
          
          // Atualizar timestamp do último evento
          this.lastEventTimestamp = currentTimestamp;
          
          // Armazenar último evento detectado
          this.lastDetectedEvent = newEvent;
          
          // Limitar o tamanho da lista ao número máximo configurado (default: 4)
          const maxEntries = this.config.max_entries || 4;
          if (this.lightningData.length > maxEntries) {
            this.lightningData = this.lightningData.slice(0, maxEntries);
          }
          
          console.log('Novo evento de raio registrado:', newEvent);
          console.log('Total de eventos no histórico:', this.lightningData.length);
        }
      } else if (this.config.entity) {
        // Modo com entidade única
        const entityId = this.config.entity;
        const stateObj = this._hass.states[entityId];
        
        if (!stateObj) {
          console.error(`Entidade ${entityId} não encontrada`);
          return;
        }
        
        // Verificar se o sensor tem eventos como atributo
        if (stateObj.attributes.lightning_events) {
          this.lightningData = JSON.parse(stateObj.attributes.lightning_events);
          
          // Limitar o tamanho da lista ao número máximo configurado
          const maxEntries = this.config.max_entries || 4;
          if (this.lightningData.length > maxEntries) {
            this.lightningData = this.lightningData.slice(0, maxEntries);
          }
        } else {
          const now = new Date();
          const currentTimestamp = now.getTime();
          
          // Inicializar lastEventTimestamp se não existir
          if (!this.lastEventTimestamp) {
            this.lastEventTimestamp = 0;
          }
          
          // Obter valores do estado e atributos
          const distance = parseFloat(stateObj.state) || 0;
          const strength = parseFloat(stateObj.attributes.energy) || 
                          parseFloat(stateObj.attributes.strength) || 50;
          
          // Verificar mudanças significativas nos valores
          const significantChange = !this.lastDetectedEvent || 
              Math.abs(distance - this.lastDetectedEvent.distance) > 0.5 || 
              Math.abs(strength - this.lastDetectedEvent.strength) > 5;
              
          // Verificar tempo mínimo desde o último evento
          const minTimeDiff = 30000; // 30 segundos
          const timeElapsed = currentTimestamp - this.lastEventTimestamp > minTimeDiff;
          
          // Criar novo evento se houver mudança significativa ou tempo suficiente passou
          if (significantChange && timeElapsed) {
            const lastEvent = {
              id: currentTimestamp,
              timestamp: now.toISOString(),
              distance: distance,
              strength: strength
            };
            
            // Adicionar ao início do array
            this.lightningData.unshift(lastEvent);
            
            // Atualizar timestamp do último evento
            this.lastEventTimestamp = currentTimestamp;
            
            // Armazenar último evento detectado
            this.lastDetectedEvent = lastEvent;
            
            // Limitar o tamanho da lista ao número máximo configurado
            const maxEntries = this.config.max_entries || 4;
            if (this.lightningData.length > maxEntries) {
              this.lightningData = this.lightningData.slice(0, maxEntries);
            }
            
            console.log('Novo evento de raio registrado:', lastEvent);
            console.log('Total de eventos no histórico:', this.lightningData.length);
          }
        }
      }
      
      // Se não houver dados, usar dados de exemplo apenas na primeira carga
      if (this.lightningData.length === 0 && !this.loadedExampleData) {
        this.lightningData = [
          { id: 1, timestamp: new Date().toISOString(), distance: 8.3, strength: 65 },
          { id: 2, timestamp: new Date(Date.now() - 2*60000).toISOString(), distance: 12.1, strength: 42 },
          { id: 3, timestamp: new Date(Date.now() - 7*60000).toISOString(), distance: 3.2, strength: 89 },
          { id: 4, timestamp: new Date(Date.now() - 13*60000).toISOString(), distance: 15.7, strength: 38 }
        ];
        this.loadedExampleData = true;
      }
    } catch (e) {
      console.error("Erro ao processar dados do sensor:", e);
    }
  }

  render() {
    if (!this._hass) return;

    // Obter dados principais
    const closestLightning = this.lightningData.length > 0 
      ? this.lightningData.reduce((prev, current) => (prev.distance < current.distance) ? prev : current)
      : null;
    
    const strongestLightning = this.lightningData.length > 0
      ? this.lightningData.reduce((prev, current) => (prev.strength > current.strength) ? prev : current)
      : null;

    // Construir HTML do cartão
    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          :host {
            --danger-color: #e74c3c;
            --warning-color: #f39c12;
            --warning-secondary-color: #f1c40f;
            --success-color: #2ecc71;
            --primary-color: #3498db;
            --background-color: #ffffff;
            --card-background-color: var(--ha-card-background, var(--background-color));
            --text-primary-color: #303030;
            --text-secondary-color: #707070;
            --border-color: #eeeeee;
          }
          
          ha-card {
            padding: 16px;
            color: var(--text-primary-color);
          }
          
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          }
          
          .name {
            font-size: 1.2rem;
            font-weight: 500;
          }
          
          .count {
            display: flex;
            align-items: center;
          }
          
          .count-icon {
            width: 18px;
            height: 18px;
            margin-right: 4px;
            color: var(--warning-color);
          }
          
          .card-content {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          
          .radar-container {
            position: relative;
            height: 240px;
            background-color: #f8f9fa;
            border-radius: 50%;
            margin-bottom: 16px;
          }
          
          .radar-circles {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .radar-circle {
            position: absolute;
            border-radius: 50%;
            border: 1px solid var(--border-color);
          }
          
          .radar-circle.outer {
            width: 200px;
            height: 200px;
          }
          
          .radar-circle.middle {
            width: 140px;
            height: 140px;
          }
          
          .radar-circle.inner {
            width: 80px;
            height: 80px;
          }
          
          .radar-center {
            width: 8px;
            height: 8px;
            background-color: var(--primary-color);
            border-radius: 50%;
          }
          
          .lightning-marker {
            position: absolute;
            transform: translate(-50%, -50%);
            color: var(--warning-color);
          }
          
          .icon-large {
            width: 32px;
            height: 32px;
          }
          
          .icon-medium-large {
            width: 28px;
            height: 28px;
          }
          
          .icon-medium {
            width: 24px;
            height: 24px;
          }
          
          .icon-small {
            width: 20px;
            height: 20px;
          }
          
          .metrics-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
          }
          
          .metric-card {
            padding: 12px;
            border-radius: 8px;
          }
          
          .metric-card.closest {
            background-color: #e3f2fd;
            border: 1px solid #bbdefb;
          }
          
          .metric-card.strongest {
            background-color: #fff8e1;
            border: 1px solid #ffecb3;
          }
          
          .metric-label {
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--text-secondary-color);
            margin-bottom: 4px;
          }
          
          .metric-value {
            display: flex;
            align-items: center;
          }
          
          .value {
            font-size: 1.4rem;
            font-weight: 700;
          }
          
          .distance-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
          }
          
          .strength-icon {
            width: 20px;
            height: 20px;
            margin-right: 8px;
            color: var(--warning-color);
          }
          
          .metric-time {
            font-size: 0.75rem;
            color: var(--text-secondary-color);
            margin-top: 4px;
          }
          
          .section-title {
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--text-secondary-color);
            margin-bottom: 8px;
          }
          
          .events-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .event-item {
            display: flex;
            align-items: center;
            padding: 8px;
            background-color: #f8f9fa;
            border: 1px solid var(--border-color);
            border-radius: 8px;
          }
          
          .event-icon {
            margin-right: 12px;
            color: var(--warning-color);
          }
          
          .event-details {
            flex: 1;
          }
          
          .event-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
          }
          
          .event-distance {
            font-weight: 500;
          }
          
          .event-time {
            font-size: 0.8rem;
            color: var(--text-secondary-color);
          }
          
          .strength-bar {
            height: 4px;
            background-color: #eeeeee;
            border-radius: 2px;
            overflow: hidden;
          }
          
          .strength-level {
            height: 100%;
            background-color: var(--warning-color);
            border-radius: 2px;
          }
          
          .empty-state {
            padding: 24px;
            text-align: center;
            color: var(--text-secondary-color);
          }
        </style>
        
        <div class="card-header">
          <div class="name">${this.config.name || 'Monitor de Raios'}</div>
          <div class="count">
            <svg class="count-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 0L9 6H4L8 10L6 16L12 12L18 16L16 10L20 6H15L13 0L11 0Z" />
            </svg>
            <span>${this.lightningData.length} registros</span>
          </div>
        </div>
        
        <div class="card-content">
          ${this.config.show_radar ? `
            <div class="radar-container">
              <div class="radar-circles">
                <div class="radar-circle outer"></div>
                <div class="radar-circle middle"></div>
                <div class="radar-circle inner"></div>
                <div class="radar-center"></div>
                
                ${this.lightningData.map(lightning => {
                  // Calcular posição baseada em distância
                  const angle = Math.random() * Math.PI * 2; // Ângulo aleatório para demonstração
                  const radius = (lightning.distance / 20) * 100; // Ajustar distância para raio visual
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;
                  
                  const iconClass = this.getIconClass(lightning.strength);
                  
                  return `
                    <div class="lightning-marker ${iconClass}" 
                         style="left: calc(50% + ${x}px); top: calc(50% + ${y}px);">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 2v11h3v9l7-12h-4l3-8z" />
                      </svg>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
          
          ${this.lightningData.length === 0 ? `
            <div class="empty-state">Nenhum evento de raio detectado</div>
          ` : `
            <div class="metrics-container">
              <div class="metric-card closest">
                <div class="metric-label">Raio mais próximo</div>
                <div class="metric-value">
                  <span class="distance-indicator" 
                        style="background-color: ${this.getDistanceColor(closestLightning.distance)}"></span>
                  <span class="value">${closestLightning.distance.toFixed(1)} km</span>
                </div>
                <div class="metric-time">${this.formatTime(closestLightning.timestamp)}</div>
              </div>
              
              <div class="metric-card strongest">
                <div class="metric-label">Raio mais forte</div>
                <div class="metric-value">
                  <svg class="strength-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 2v11h3v9l7-12h-4l3-8z" />
                  </svg>
                  <span class="value">${strongestLightning.strength}</span>
                </div>
                <div class="metric-time">${this.formatTime(strongestLightning.timestamp)}</div>
              </div>
            </div>
          `}
          
          ${this.config.show_recent && this.lightningData.length > 0 ? `
            <div class="recent-events">
              <h3 class="section-title">Registros Recentes</h3>
              <div class="events-list">
                ${this.lightningData.slice(0, this.config.max_entries || 4).map(lightning => `
                  <div class="event-item">
                    <div class="event-icon ${this.getIconClass(lightning.strength)}">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 2v11h3v9l7-12h-4l3-8z" />
                      </svg>
                    </div>
                    <div class="event-details">
                      <div class="event-header">
                        <span class="event-distance">${lightning.distance.toFixed(1)} km</span>
                        <span class="event-time">${this.formatTime(lightning.timestamp)}</span>
                      </div>
                      <div class="strength-bar">
                        <div class="strength-level" style="width: ${lightning.strength}%"></div>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </ha-card>
    `;
  }
}

customElements.define('lightning-monitor-card', LightningMonitorCard);

// Disponibilize o cartão para o HACS
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lightning-monitor-card',
  name: 'Lightning Monitor Card',
  description: 'Um cartão para visualização de dados de detecção de raios',
  preview: true
});
