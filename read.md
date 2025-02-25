# Lightning Monitor Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![GitHub Release](https://img.shields.io/github/release/SEU_USUARIO/lightning-monitor-card.svg)](https://github.com/SEU_USUARIO/lightning-monitor-card/releases)
[![GitHub License](https://img.shields.io/github/license/SEU_USUARIO/lightning-monitor-card.svg)](https://github.com/SEU_USUARIO/lightning-monitor-card/blob/main/LICENSE)

Um cartão personalizado para Home Assistant que exibe de forma visual os dados de detecção de raios, mostrando distância e força dos raios detectados.

![Demonstração do Card](./demo.png)

## Recursos

- Visualização radial de eventos de raios
- Indicadores para raios mais próximos e mais fortes
- Lista de eventos recentes com representação visual da intensidade
- Codificação por cores baseada na distância do raio
- Interface de configuração amigável

## Instalação

### HACS (recomendado)

1. Certifique-se de que [HACS](https://hacs.xyz/) esteja instalado
2. Adicione este repositório como um repositório personalizado no HACS:
   - Vá para HACS > Frontend > menu de três pontos > Repositórios personalizados
   - Adicione a URL: `https://github.com/SEU_USUARIO/lightning-monitor-card`
   - Selecione a categoria: `Lovelace`
3. Clique em `+ Explorar & baixar repositórios` e pesquise por "Lightning Monitor"
4. Clique em `Download`
5. Reinicie o Home Assistant

### Manual

1. Faça o download do arquivo [lightning-monitor-card.js](https://github.com/SEU_USUARIO/lightning-monitor-card/releases/latest)
2. Faça upload para seu servidor Home Assistant em `/config/www/lightning-monitor-card.js`
3. Adicione o recurso em `configuration.yaml`:
   ```yaml
   lovelace:
     resources:
       - url: /local/lightning-monitor-card.js
         type: module
   ```
4. Reinicie o Home Assistant

## Utilização

Adicione o cartão ao seu painel:

1. Vá para o Dashboard onde deseja adicionar o cartão
2. Clique em `Editar Dashboard`
3. Clique em `+ Adicionar Cartão`
4. Procure por "Lightning Monitor" ou use a opção "Manual"
5. Configure o cartão com a entidade do seu sensor de raios

### Configuração YAML Manual

```yaml
type: custom:lightning-monitor-card
entity: sensor.lightning_detector
name: Monitor de Raios
show_radar: true
show_recent: true
max_entries: 4
```

## Opções de Configuração

| Opção | Tipo | Padrão | Descrição |
|---|---|---|---|
| `entity` | string | **Obrigatório** | Entidade do sensor de raios |
| `name` | string | `Monitor de Raios` | Nome do cartão |
| `show_radar` | boolean | `true` | Mostrar visualização radial |
| `show_recent` | boolean | `true` | Mostrar lista de eventos recentes |
| `max_entries` | number | `4` | Número máximo de eventos na lista |

## Formato dos Dados

O componente espera que o sensor tenha um atributo `lightning_events` contendo um array JSON com objetos no seguinte formato:

```json
[
  {
    "id": 1,
    "timestamp": "2025-02-25T10:15:30",
    "distance": 8.3,
    "strength": 65
  },
  ...
]
```

Onde:
- `id`: Identificador único do evento
- `timestamp`: Data e hora no formato ISO
- `distance`: Distância em quilômetros
- `strength`: Intensidade do raio (0-100)

## Compatibilidade

Testado com sensores:
- AS3935 Lightning Detector
- BlitzortungNow Integration

## Solução de Problemas

Se você encontrar problemas:

1. Verifique se o formato dos dados do seu sensor está correto
2. Verifique os logs do navegador para erros JavaScript
3. Certifique-se de que o recurso foi carregado corretamente

## Contribuições

Contribuições são bem-vindas! Sinta-se livre para enviar pull requests com melhorias ou correções.

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).
