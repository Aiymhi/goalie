import {
  evaluateAssessment,
  NotImplementedError as AssessmentNotImplemented,
} from '../src/domain/assessment';
import {
  issueCertificate,
  NotImplementedError as CertificatesNotImplemented,
} from '../src/domain/certificates';
import {
  advanceProgress,
  NotImplementedError as ProgressionNotImplemented,
} from '../src/domain/progression';
import {
  grantReward,
  NotImplementedError as RewardsNotImplemented,
} from '../src/domain/rewards';

describe('placeholder domain modules', () => {
  it('evaluateAssessment throws NotImplementedError', () => {
    expect(() => evaluateAssessment(undefined as never)).toThrow(
      AssessmentNotImplemented,
    );
  });

  it('grantReward throws NotImplementedError', () => {
    expect(() => grantReward(undefined as never)).toThrow(RewardsNotImplemented);
  });

  it('advanceProgress throws NotImplementedError', () => {
    expect(() => advanceProgress(undefined as never)).toThrow(
      ProgressionNotImplemented,
    );
  });

  it('issueCertificate throws NotImplementedError', () => {
    expect(() => issueCertificate(undefined as never)).toThrow(
      CertificatesNotImplemented,
    );
  });
});
