export default function WinScreen({ onRestart }) {
  return (
    <div className="win-screen">
      <div className="win-card">
        <div className="confetti">🎉 🎊 💕 🎉 🎊</div>
        <h1>Вы дошли до финиша!</h1>
        <p className="win-subtitle">Вместе всё возможно</p>
        <div className="hearts-big">❤️ 💙 ❤️</div>
        <p className="win-msg">Поздравляем — вы прошли все уровни вместе!</p>
        <button className="btn-primary" onClick={onRestart}>
          Сыграть ещё раз
        </button>
      </div>
    </div>
  );
}
