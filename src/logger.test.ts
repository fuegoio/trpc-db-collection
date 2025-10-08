import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger } from './logger'

describe('Logger', () => {
  let logger: Logger
  let consoleSpy: any

  beforeEach(() => {
    // Reset the logger before each test
    logger = new Logger({}, 'test')
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should log debug messages when level is debug', () => {
    logger = new Logger({ level: 'debug' }, 'test')
    logger.debug('Debug message')
    expect(consoleSpy.debug).toHaveBeenCalled()
  })

  it('should log info messages when level is info', () => {
    logger = new Logger({ level: 'info' }, 'test')
    logger.info('Info message')
    expect(consoleSpy.info).toHaveBeenCalled()
  })

  it('should log error messages when level is error', () => {
    logger = new Logger({ level: 'error' }, 'test')
    logger.error('Error message')
    expect(consoleSpy.error).toHaveBeenCalled()
  })

  it('should log debug messages when level is info', () => {
    logger = new Logger({ level: 'info' }, 'test')
    logger.debug('Debug message')
    // The debug method should log when level is 'info'
    expect(consoleSpy.debug).toHaveBeenCalled()
  })

  it('should not log info messages when level is error', () => {
    logger = new Logger({ level: 'error' }, 'test')
    logger.info('Info message')
    expect(consoleSpy.info).not.toHaveBeenCalled()
  })

  it('should not log anything when level is none', () => {
    logger = new Logger({ level: 'none' }, 'test')
    logger.debug('Debug message')
    logger.info('Info message')
    logger.error('Error message')
    expect(consoleSpy.debug).not.toHaveBeenCalled()
    expect(consoleSpy.info).not.toHaveBeenCalled()
    expect(consoleSpy.error).not.toHaveBeenCalled()
  })

  it('should enable and disable logging', () => {
    logger = new Logger({ enabled: false }, 'test')
    logger.info('This should not be logged')
    expect(consoleSpy.info).not.toHaveBeenCalled()

    logger = new Logger({ enabled: true }, 'test')
    logger.info('This should be logged')
    expect(consoleSpy.info).toHaveBeenCalled()
  })
})