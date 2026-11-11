import {
  getAvaliacaoSemana,
  getDesempenho,
  getCaixinha,
  getConfig,
  getEscalaSemana,
  getFinanceSnapshot,
  getNildeWeek,
  getTarefaSemana,
  getTaskFeed,
  getTaskRatings,
  queryFor,
} from '../services/api';
import { useResource } from './store';

/** Um hook por recurso. Telas diferentes que pedem o mesmo dado compartilham UMA requisição. */

export const useFinance = (sheet = '') =>
  useResource(`finance:${sheet}`, () => getFinanceSnapshot(sheet), { resources: ['finance'], cacheQuery: queryFor('getFinanceSnapshot', { sheet }) });

export const useCaixinha = () => useResource('caixinha', getCaixinha, { resources: ['caixinha'], cacheQuery: queryFor('getCaixinha') });

export const useMyTask = (resident) =>
  useResource(`task:${resident}`, () => getTarefaSemana(resident), { resources: ['feed', 'escala', 'config'], cacheQuery: queryFor('getTarefaSemana', { usuario: resident }) });

export const useEscala = () => useResource('escala', getEscalaSemana, { resources: ['feed', 'escala'], cacheQuery: queryFor('getEscalaSemana') });

export const useRatings = (resident) =>
  useResource(`ratings:${resident}`, () => getTaskRatings(resident), { resources: ['ratings'], cacheQuery: queryFor('getTaskRatings', { strict: 1, actor: resident, history: 0 }) });

export const useFeed = (week = '') =>
  useResource(`feed:${week}`, () => getTaskFeed(week), { resources: ['feed', 'likes'], cacheQuery: queryFor('getTaskFeed', { strict: 1, photos: 0, likes: 1, week }) });

export const useNilde = () => useResource('nilde', getNildeWeek, { resources: ['feed'], cacheQuery: queryFor('getNildeWeek') });

export const useConfig = () => useResource('config', getConfig, { resources: ['config'], cacheQuery: queryFor('getConfig') });

export const useAvaliacao = (resident) =>
  useResource(`avaliacao:${resident}`, () => getAvaliacaoSemana(resident), { resources: ['avaliacao', 'feed', 'ratings', 'escala'], cacheQuery: queryFor('getAvaliacaoSemana', { usuario: resident }) });

export const useDesempenho = () => useResource('desempenho', getDesempenho, { resources: ['avaliacao'], cacheQuery: queryFor('getDesempenho') });
