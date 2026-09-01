export const WORKOUT_LIBRARY_VERSION = 1;

export const WORKOUT_LIBRARY = [
  {
    id: "easy-run", name: "Corrida leve", category: "easy", rpe: [3, 4], distanceFactor: 1,
    objective: "Construir consistência com esforço controlado",
    instructions: "Corra em intensidade confortável, com respiração estável e sensação de que seria possível continuar.",
    substitutions: ["run-walk", "easy-walk", "rest"]
  },
  {
    id: "recovery-run", name: "Recuperação", category: "recovery", rpe: [2, 3], distanceFactor: 0.7,
    objective: "Favorecer recuperação sem acrescentar fadiga relevante",
    instructions: "Mantenha ritmo muito leve. Caminhar é uma opção válida se o corpo pedir.",
    substitutions: ["easy-walk", "rest"]
  },
  {
    id: "run-walk", name: "Corrida e caminhada", category: "easy", rpe: [2, 4], distanceFactor: 0.8,
    objective: "Acumular tempo em movimento com pausas planejadas",
    instructions: "Alterne blocos curtos de corrida confortável e caminhada antes de perder o controle do esforço.",
    substitutions: ["easy-walk", "rest"]
  },
  {
    id: "long-run", name: "Longão", category: "endurance", rpe: [4, 5], distanceFactor: 1.3,
    objective: "Desenvolver resistência com reserva",
    instructions: "Comece mais leve do que parece necessário e termine ainda capaz de manter a forma.",
    substitutions: ["easy-run", "run-walk", "rest"]
  },
  {
    id: "tempo-run", name: "Tempo run", category: "quality", rpe: [5, 6], distanceFactor: 1,
    objective: "Sustentar esforço firme sem transformar a sessão em prova",
    instructions: "Faça início leve, um bloco contínuo firme e controlado e finalize leve.",
    substitutions: ["progression-run", "easy-run", "rest"]
  },
  {
    id: "interval-run", name: "Intervalado", category: "quality", rpe: [6, 7], distanceFactor: 1,
    objective: "Praticar velocidade preservando técnica e recuperação",
    instructions: "Aqueça, alterne blocos fortes curtos com recuperação suficiente e desacelere ao final.",
    substitutions: ["fartlek-light", "easy-run", "rest"]
  },
  {
    id: "progression-run", name: "Progressivo", category: "quality", rpe: [4, 6], distanceFactor: 1,
    objective: "Aprender a distribuir o esforço",
    instructions: "Comece confortável e aumente gradualmente, sem sprint no final.",
    substitutions: ["easy-run", "run-walk", "rest"]
  },
  {
    id: "fartlek-light", name: "Fartlek leve", category: "quality", rpe: [4, 6], distanceFactor: 0.9,
    objective: "Variar ritmo sem cobrança rígida de pace",
    instructions: "Intercale acelerações curtas por sensação com trechos leves de recuperação completa.",
    substitutions: ["easy-run", "run-walk", "rest"]
  },
  {
    id: "performance-test", name: "Teste controlado", category: "test", rpe: [7, 8], distanceFactor: 1,
    objective: "Atualizar referências quando há base suficiente",
    instructions: "Execute apenas sem sinais de alerta e depois de uma semana estável. O resultado não define seu valor.",
    substitutions: ["tempo-run", "easy-run", "rest"]
  },
  {
    id: "easy-walk", name: "Caminhada leve", category: "recovery", rpe: [1, 3], distanceFactor: 0.6,
    objective: "Manter movimento com baixo impacto",
    instructions: "Caminhe em ritmo confortável e encerre se qualquer desconforto aumentar.",
    substitutions: ["rest"]
  },
  {
    id: "rest", name: "Descanso", category: "rest", rpe: [1, 1], distanceFactor: 0,
    objective: "Permitir recuperação",
    instructions: "Não é um treino perdido. Retome pelo próximo dia disponível sem compensar volume.",
    substitutions: []
  }
];

export function workoutById(id) {
  return WORKOUT_LIBRARY.find(workout => workout.id === id) || WORKOUT_LIBRARY[0];
}
