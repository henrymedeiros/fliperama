# Ping Pongola

Tênis de mesa 3D para crianças em que o **celular vira a raquete**. O computador mostra o ginásio, os bonequinhos, a bola e os sons. O celular lê os sensores (orientação, giroscópio e acelerômetro), manda os dados direto para o computador por P2P e vibra quando a bola bate na raquete.

Funciona como site estático: é só HTML, CSS e JavaScript, sem build.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie estes arquivos para a branch `main`.
2. No repositório, abra **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
4. Aguarde o endereço aparecer (algo como `https://seu-usuario.github.io/ping-pongola/`).

O GitHub Pages usa HTTPS, e isso é obrigatório: o celular só libera os sensores de movimento em páginas HTTPS.

## Como jogar

1. Abra o endereço no computador.
2. Aponte a câmera do celular para o QR code no canto da tela. O celular abre o **mesmo endereço**, com `?c=CÓDIGO` no final, e vira raquete.
3. Toque em **Ligar raquete** (no iPhone, aceite a permissão dos sensores).
4. Segure o celular em pé, com a traseira virada para a tela, e toque em **Calibrar**.
5. No computador, escolha **Criar partida**.

Golpes:

| Movimento do celular | Resultado |
| --- | --- |
| Golpe rápido | Bola mais rápida (o rastro fica maior) |
| Girar para a esquerda ou direita | Mira para aquele lado |
| Golpe de baixo para cima | Topspin (a bola mergulha e acelera no quique) |
| Golpe de cima para baixo | Backspin (a bola flutua e freia no quique) |
| Golpe de lado | Spin lateral (a bola faz curva) |
| Golpe reto | Direto |
| Toquinho para cima | Lança a bola no saque (ou use o botão **Sacar**) |

Sem celular, dá para jogar com o mouse: mova para posicionar, clique para rebater, segure W, S, A ou D para dar efeito e use Espaço para lançar a bola no saque.

## Modos

- **Contra o computador:** fácil, normal ou difícil.
- **Dois jogadores:** dois celulares na mesma tela, com câmera de lado.
- **Online com amigo:** um computador cria a sala e mostra um código de 5 letras; o outro escolhe **Entrar em sala**. Cada um usa o próprio celular. O link `?sala=CÓDIGO` também abre a tela de entrada já preenchida.

Opções: qualidade gráfica (Leve a Ultra), sombras, rastro, faíscas, câmera, volumes, mão da raquete, sensibilidade, ajuda de mira, velocidade da bola, vibração e personalização do jogador.

## Como funciona

| Arquivo | Papel |
| --- | --- |
| `index.html` | Telas do computador e do celular |
| `css/style.css` | Visual (tokens de cor, botões, HUD, tela do celular) |
| `js/main.js` | Decide se a página é o jogo ou a raquete (`?c=`) |
| `js/desktop.js` | Menus, QR code, conexões P2P e laço principal |
| `js/controller.js` | Raquete: sensores, calibragem, vibração |
| `js/game.js` | Regras, rebatidas, efeitos, IA e sincronia online |
| `js/physics.js` | Física da bola (gravidade, arrasto, Magnus, quique com atrito) e mira automática |
| `js/input.js` | Converte sensores, mouse ou IA em posição e velocidade da raquete |
| `js/world.js`, `js/mii.js`, `js/textures.js`, `js/fx.js` | Ginásio, bonequinhos, texturas e efeitos, todos gerados por código |
| `js/audio.js` | Sons sintetizados com WebAudio |

Bibliotecas por CDN: Three.js 0.170, PeerJS 1.5.4 e qrcode-generator 1.4.4.

A conexão é P2P com WebRTC. O servidor público gratuito do PeerJS só apresenta os aparelhos; depois disso os dados de sensores, golpes e placar vão direto entre eles. O celular manda cerca de 60 amostras por segundo.

## Limitações conhecidas

- O servidor público do PeerJS é gratuito e às vezes fica instável. Se o pareamento falhar, recarregue a página.
- No modo online entre redes diferentes, algumas redes (por exemplo, 4G com NAT restrito) precisam de um servidor TURN, que não está incluído. Na mesma rede Wi-Fi funciona sem isso.
- O iPhone não tem a API de vibração. No iOS 18 ou mais novo o jogo usa um toque háptico curto; em versões antigas, o celular só pisca e faz som.
- Abrir pelo `localhost` funciona no computador, mas o celular não alcança esse endereço. Use o endereço do GitHub Pages.
