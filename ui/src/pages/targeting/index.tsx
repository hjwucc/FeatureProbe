import {
  useCallback,
  useEffect,
  useState,
  SyntheticEvent,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  Form,
  Radio,
  CheckboxProps,
  TextAreaProps,
  InputOnChangeData,
  Loader,
  Dropdown,
  DropdownItemProps,
  Popup,
  RadioProps,
} from 'semantic-ui-react';
import { useParams, useHistory, Prompt } from 'react-router-dom';
import isEqual from 'lodash/isEqual';
import moment from 'moment';
import { useForm } from 'react-hook-form';
import { FormattedMessage, useIntl } from 'react-intl';
import cloneDeep from 'lodash/cloneDeep';
import { v4 as uuidv4 } from 'uuid';
import { diff } from 'deep-diff';
import Joyride, { CallBackProps, EVENTS, ACTIONS, Step } from 'react-joyride';
import Rules from './components/Rules';
import DefaultRule from './components/DefaultRule';
import DisabledServe from './components/DisabledServe';
import { useBeforeUnload } from './hooks';
import Icon from 'components/Icon';
import message from 'components/MessageBox';
import Modal from 'components/Modal';
import Button from 'components/Button';
import Variations from 'components/Variations';
import SectionTitle from 'components/SectionTitle';
import EventTracker from 'components/EventTracker';
import Diff from 'components/Diff';
import { approveToggle, saveToggle } from 'services/toggle';
import { replaceSpace } from 'utils/tools';
import {
  variationContainer,
  ruleContainer,
  defaultServeContainer,
  disabledServeContainer,
  hooksFormContainer,
  segmentContainer,
} from './provider';
import { VariationColors } from 'constants/colors';
import {
  IApprovalInfo,
  ICondition,
  IDictionary,
  IOption,
  IRule,
  IServe,
  ITarget,
  ITargeting,
  ITargetingParams,
  IToggleInfo,
  IVariation,
} from 'interfaces/targeting';
import { IRouterParams } from 'interfaces/project';
import { ISegmentList } from 'interfaces/segment';
import { DATETIME_TYPE, SEGMENT_TYPE } from 'components/Rule/constants';
import { DiffServe } from 'components/Diff/DiffServe';
import VariationsDiffContent from 'components/Diff/VariationsDiffContent';
import { I18NRules, RulesDiffContent } from 'components/Diff/RulesDiffContent';
import { DiffStatusContent } from 'components/Diff/DiffStatus';
import { commonConfig, floaterStyle, tourStyle } from 'constants/tourConfig';
import { getFromDictionary, saveDictionary } from 'services/dictionary';
import { USER_GUIDE_LAYOUT, USER_GUIDE_TARGETING } from 'constants/dictionary_keys';
import { useFormErrorScrollIntoView } from 'hooks';

import styles from './index.module.scss';

interface IProps {
  disabled?: boolean;
  targeting?: ITarget;
  toggleInfo?: IToggleInfo;
  approvalInfo?: IApprovalInfo;
  toggleDisabled: boolean;
  trackEvents: boolean;
  allowEnableTrackEvents: boolean;
  initialTargeting?: ITargeting;
  segmentList?: ISegmentList;
  initTargeting(): void;
  saveToggleDisable(status: boolean): void;
}

const STEPS: Step[] = [
  {
    content: (
      <div>
        <div className="joyride-title">
          <FormattedMessage id="guide.toggle.targeting.step1.title" />
        </div>
        <ul className="joyride-item">
          <li>
            <FormattedMessage id="guide.toggle.targeting.step1.off" />
          </li>
          <li>
            <FormattedMessage id="guide.toggle.targeting.step1.on" />
          </li>
        </ul>
        <div className="joyride-pagination">1/2</div>
      </div>
    ),
    spotlightPadding: 20,
    placement: 'right',
    target: '.joyride-toggle-status',
    ...commonConfig,
  },
  {
    content: (
      <div>
        <div className="joyride-title">
          <FormattedMessage id="guide.toggle.targeting.step2.title" />
        </div>
        <ul className="joyride-item">
          <li>
            <FormattedMessage id="guide.toggle.targeting.step2.default" />
          </li>
        </ul>
        <div className="joyride-pagination">2/2</div>
      </div>
    ),
    spotlightPadding: 4,
    placement: 'right',
    target: '.joyride-default-rule',
    ...commonConfig,
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Targeting = forwardRef((props: IProps, ref: any) => {
  const {
    disabled,
    toggleInfo,
    approvalInfo,
    targeting,
    toggleDisabled,
    initialTargeting,
    segmentList,
    trackEvents,
    allowEnableTrackEvents,
    initTargeting,
    saveToggleDisable,
  } = props;
  const { rules, saveRules } = ruleContainer.useContainer();
  const { variations, saveVariations } = variationContainer.useContainer();
  const { defaultServe, saveDefaultServe } = defaultServeContainer.useContainer();
  const { disabledServe, saveDisabledServe } = disabledServeContainer.useContainer();
  const { projectKey, environmentKey, toggleKey } = useParams<IRouterParams>();
  const [open, setOpen] = useState<boolean>(false);
  const [publishDisabled, setPublishDisabled] = useState<boolean>(true);
  const [publishTargeting, setPublishTargeting] = useState<ITargeting>();
  const [comment, saveComment] = useState<string>('');
  const [isLoading, setLoading] = useState<boolean>(false);
  const [options, saveOptions] = useState<IOption[]>();
  const [run, saveRun] = useState<boolean>(false);
  const [stepIndex, saveStepIndex] = useState<number>(0);
  const [isCollect, saveIsCollect] = useState<string>('');
  const [isDiffChange, saveIsDiffChange] = useState<boolean>(false);
  const history = useHistory();
  const intl = useIntl();
  const formRef = useRef();

  useBeforeUnload(!publishDisabled, intl.formatMessage({ id: 'targeting.page.leave.text' }));
  useImperativeHandle(ref, () => publishDisabled, [publishDisabled]);

  const {
    formState: newFormState,
    trigger: newTrigger,
    register: newRegister,
    setValue: newSetValue,
    clearErrors,
  } = useForm();

  const {
    setValue,
    setError,
    handleSubmit,
    formState: { errors },
  } = hooksFormContainer.useContainer();

  const { saveSegmentList } = segmentContainer.useContainer();

  const { scrollToError, setBeforeScrollCallback } = useFormErrorScrollIntoView(errors);

  useEffect(() => {
    setBeforeScrollCallback((names: string[]) => {
      names.forEach((name) => {
        if (name.startsWith('rule')) {
          const id = name.split('_')[1];
          for (let i = 0; i < rules.length; i++) {
            if (rules[i].id === id) {
              saveRules((rules: IRule[]) => {
                rules[i].active = true;
                return [...rules];
              });
              return;
            }
          }
        }
      });
    });
  }, [setBeforeScrollCallback, rules, saveRules]);

  useEffect(() => {
    Promise.all([
      getFromDictionary<IDictionary>(USER_GUIDE_LAYOUT),
      getFromDictionary<IDictionary>(USER_GUIDE_TARGETING),
    ]).then((res) => {
      // After finishing layout user guide, then show targeting user guide
      if (res[0].success && res[0].data && parseInt(JSON.parse(res[0].data.value)) === 3) {
        const { success, data } = res[1];
        if (success && data) {
          const savedData = JSON.parse(data.value);
          if (parseInt(savedData) !== STEPS.length) {
            setTimeout(() => {
              saveRun(true);
            }, 0);
            saveStepIndex(parseInt(savedData));
          }
        } else {
          setTimeout(() => {
            saveRun(true);
          }, 0);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (targeting) {
      const cloneVariations = cloneDeep(targeting.variations) || [];
      cloneVariations.forEach((variation: IVariation) => {
        variation.id = uuidv4();
      });
      saveVariations(cloneVariations);

      const targetRule = cloneDeep(targeting.rules);
      targetRule.forEach((rule: IRule) => {
        rule.id = uuidv4();
        rule.conditions.forEach((condition: ICondition) => {
          condition.id = uuidv4();
          if (condition.type === SEGMENT_TYPE) {
            condition.subject = intl.formatMessage({ id: 'common.user.text' });
          } else if (condition.type === DATETIME_TYPE && condition.objects) {
            condition.datetime = condition.objects[0].slice(0, 19);
            condition.timezone = condition.objects[0].slice(19);
          }
        });
        rule.active = true;
      });
      saveRules(targetRule);

      saveDefaultServe(targeting.defaultServe);
      saveDisabledServe(targeting.disabledServe);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targeting, saveVariations, saveRules, saveDefaultServe, saveDisabledServe]);

  useEffect(() => {
    saveSegmentList(segmentList);
  }, [segmentList, saveSegmentList]);

  useEffect(() => {
    rules.forEach((rule: IRule) => {
      if (rule.serve && Object.prototype.hasOwnProperty.call(rule.serve, 'select')) {
        if (Number(rule?.serve?.select) < variations.length) {
          setValue(`rule_${rule.id}_serve`, rule.serve);
        }
      } else {
        setValue(`rule_${rule.id}_serve`, rule.serve);
      }

      rule.conditions?.forEach((condition: ICondition) => {
        if (condition.type === 'segment') {
          setValue(`rule_${rule.id}_condition_${condition.id}_subject`, condition.predicate);
        } else {
          setValue(`rule_${rule.id}_condition_${condition.id}_subject`, condition.subject);
        }
        setValue(`rule_${rule.id}_condition_${condition.id}_predicate`, condition.predicate);

        if (condition.type === DATETIME_TYPE) {
          if (condition.objects) {
            setValue(`rule_${rule.id}_condition_${condition.id}_datetime`, condition.objects[0].slice(0, 19));
            setValue(`rule_${rule.id}_condition_${condition.id}_timezone`, condition.objects[0].slice(19));
          } else {
            setValue(`rule_${rule.id}_condition_${condition.id}_datetime`, moment().format().slice(0, 19));
            setValue(`rule_${rule.id}_condition_${condition.id}_timezone`, moment().format().slice(19));
          }
        } else {
          setValue(`rule_${rule.id}_condition_${condition.id}_objects`, condition.objects);
        }
      });
    });
  }, [rules, variations, setValue]);

  useEffect(() => {
    if (targeting) {
      variations.forEach((variation: IVariation) => {
        setValue(`variation_${variation.id}_name`, variation.name);
        setValue(`variation_${variation.id}`, variation.value);
      });

      if (
        disabledServe &&
        Object.prototype.hasOwnProperty.call(disabledServe, 'select') &&
        Number(disabledServe?.select) < variations.length
      ) {
        setValue('disabledServe', disabledServe);
      }
      if (defaultServe && (typeof defaultServe.select !== 'undefined' || typeof defaultServe.split !== 'undefined')) {
        setValue('defaultServe', defaultServe);
      }
    }
  }, [variations, targeting, defaultServe, disabledServe, setValue]);

  useEffect(() => {
    const requestRules = cloneDeep(rules);
    requestRules.forEach((rule: IRule) => {
      rule.conditions.forEach((condition: ICondition) => {
        delete condition.id;
        if (condition.type === SEGMENT_TYPE) {
          delete condition.subject;
        } else if (condition.type === DATETIME_TYPE) {
          const result = [];
          result.push('' + condition.datetime + condition.timezone);
          condition.objects = result;
          delete condition.datetime;
          delete condition.timezone;
        }
      });
      delete rule.id;
      delete rule.active;
    });

    const requestVariations = cloneDeep(variations);
    requestVariations.forEach((variation: IVariation) => {
      delete variation.id;
    });

    setPublishTargeting({
      disabled: toggleDisabled,
      content: {
        rules: requestRules,
        disabledServe,
        defaultServe,
        variations: requestVariations,
      },
    });
  }, [toggleDisabled, rules, variations, defaultServe, disabledServe]);

  useEffect(() => {
    if (initialTargeting) {
      const isSame = isEqual(publishTargeting, initialTargeting);
      setPublishDisabled(isSame);
    }
  }, [publishTargeting, initialTargeting]);

  useEffect(() => {
    const options = approvalInfo?.reviewers?.map((name: string) => {
      return {
        key: name,
        value: name,
        text: name,
      };
    });

    saveOptions(options);
  }, [approvalInfo]);

  useEffect(() => {
    newRegister('reason', {
      required: approvalInfo?.enableApproval,
    });
    newRegister('radioGroup', {
      required: !approvalInfo?.enableApproval && allowEnableTrackEvents,
    });
  }, [newRegister, approvalInfo, allowEnableTrackEvents]);

  const validateForm = useCallback(() => {
    let isError = false;

    const copyRules: IRule[] = cloneDeep(rules);
    copyRules.forEach((rule: IRule) => {
      if (rule.conditions.length === 0) {
        setError(`rule_${rule.id}_add`, {
          message: intl.formatMessage({ id: 'common.input.placeholder' }),
        });
        isError = true;
      }
    });

    const clonevariations: IVariation[] = cloneDeep(variations);
    clonevariations.forEach((variation: IVariation) => {
      const res = replaceSpace(variation);
      if (res.value === '') {
        if (toggleInfo?.returnType === 'boolean') {
          setError(`variation_${variation.id}_normal`, {
            message: intl.formatMessage({id: 'toggles.returntype.placeholder'}),
          });
        } else {
          setError(`variation_${variation.id}`, {
            message: intl.formatMessage({id: 'common.input.placeholder'}),
          });
        }
        isError = true;
      }
    });

    return isError;
  }, [intl, rules, setError, toggleInfo, variations]);

  const onSubmit = useCallback(() => {
    if (validateForm()) {
      return;
    }
    setOpen(true);
  }, [validateForm]);

  const onError = useCallback(() => {
    validateForm();
    scrollToError();
  }, [scrollToError, validateForm]);

  const handlePublishCancel = useCallback(() => {
    setOpen(false);
    saveComment('');
    saveIsCollect('');
    newSetValue('reason', '');
    newSetValue('radioGroup', '');
    clearErrors();
  }, [newSetValue, clearErrors]);

  const handlePublishConfirm = useCallback(async () => {
    if (approvalInfo?.enableApproval && comment === '') {
      await newTrigger('reason');
      return;
    }

    if (!approvalInfo?.enableApproval && isCollect === '' && allowEnableTrackEvents) {
      await newTrigger('radioGroup');
      return;
    }
    setOpen(false);
    setLoading(true);
    if (publishTargeting) {
      let res;
      if (approvalInfo && approvalInfo.enableApproval) {
        res = await approveToggle(projectKey, environmentKey, toggleKey, {
          comment,
          ...publishTargeting,
          reviewers: approvalInfo.reviewers,
        });
      } else {
        const params: ITargetingParams = {
          ...publishTargeting,
          comment,
        };

        if (isCollect === 'yes') {
          params.trackAccessEvents = true;
        }
        res = await saveToggle(projectKey, environmentKey, toggleKey, params);
      }
      if (res.success) {
        if (approvalInfo && approvalInfo?.enableApproval) {
          message.success(intl.formatMessage({ id: 'targeting.approval.request.success' }));
        } else {
          message.success(intl.formatMessage({ id: 'targeting.publish.success.text' }));
        }
        initTargeting();
        saveComment('');
        saveIsCollect('');
      }
      newSetValue('reason', '');
      newSetValue('radioGroup', '');
      setLoading(false);
    }
  }, [
    approvalInfo, 
    comment, 
    isCollect, 
    allowEnableTrackEvents, 
    publishTargeting, 
    newTrigger, 
    newSetValue, 
    projectKey, 
    environmentKey, 
    toggleKey, 
    initTargeting, 
    intl
  ]);

  const disabledText = useMemo(() => {
    if (variations[disabledServe.select]) {
      return variations[disabledServe.select].name || variations[disabledServe.select].value;
    }
  }, [disabledServe.select, variations]);

  const handleInputComment = useCallback((e: SyntheticEvent, data: TextAreaProps | InputOnChangeData) => {
    saveComment(data.value as string);
  }, []);

  const renderLabel = useCallback((label: DropdownItemProps) => {
    return {
      content: label.text,
      removeIcon: null,
    };
  }, []);

  const handleGotoSetting = useCallback(() => {
    history.push(`/${projectKey}/${environmentKey}/settings`);
  }, [history, projectKey, environmentKey]);

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, type } = data;

    if (([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND] as string[]).includes(type)) {
      const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      saveStepIndex(nextStepIndex);
      saveDictionary(USER_GUIDE_TARGETING, nextStepIndex);
    }
  }, []);

  const preDiffServe = useCallback((serve?: IServe, variations?: IVariation[]) => {
    if (!serve || !variations) {
      return;
    }
    const obj: {
      select?: string;
      split?: string[];
    } = {};
    if (serve.select !== undefined && typeof serve.select === 'number') {
      obj.select = variations[serve.select].name;
    }
    if (serve.split !== undefined) {
      obj.split = serve.split.map((item: number, index: number) => {
        return `${variations[index].name}: ${item / 100}%`;
      });
    }
    return obj;
  }, []);

  const beforeServeDiff = useCallback(
    (before, after) => {
      const left = before;
      const right = after;

      return [
        preDiffServe(left, initialTargeting?.content.variations),
        preDiffServe(right, publishTargeting?.content.variations),
      ];
    },
    [preDiffServe, initialTargeting?.content.variations, publishTargeting?.content.variations]
  );

  const beforeRuleDiff = useCallback(
    (before, after) => {
      const left = I18NRules(before, intl);
      const right = I18NRules(after, intl);
      return [
        left.map((item: IRule) => {
          return {
            ...item,
            serve: preDiffServe(item.serve, initialTargeting?.content.variations),
          };
        }),
        right.map((item: IRule) => {
          return {
            ...item,
            serve: preDiffServe(item.serve, publishTargeting?.content.variations),
          };
        }),
      ];
    },
    [preDiffServe, initialTargeting?.content.variations, publishTargeting?.content.variations, intl]
  );

  const handleRadioChange = useCallback((e: SyntheticEvent, detail: RadioProps) => {
    saveIsCollect(detail.value as string);
  }, []);

  useEffect(() => {
    if (initialTargeting && publishTargeting && open) {
      let isDiffChange = false;
      if (
        diff(initialTargeting.disabled, publishTargeting.disabled) ||
        diff(initialTargeting.content.defaultServe, publishTargeting.content.defaultServe) ||
        diff(initialTargeting.content.disabledServe, publishTargeting.content.disabledServe)
      ) {
        isDiffChange = true;
      }

      const diffVariation = diff(initialTargeting.content.variations, publishTargeting.content.variations);
      if (diffVariation) {
        diffVariation.forEach(item => {
          if (item.kind !== 'E') {
            isDiffChange = true;
          } else if (item.kind === 'E' && (item.path?.[1] !== 'name' && item.path?.[1] !== 'description')) {
            isDiffChange = true;
          }
        });
      }

      const diffRules = diff(initialTargeting.content.rules, publishTargeting.content.rules);
      if (diffRules) {
        diffRules.forEach(item => {
          if (item.kind !== 'E') {
            isDiffChange = true;
          } else if (item.kind === 'E' && item.path?.[1] !== 'name') {
            isDiffChange = true;
          }
        });
      }

      saveIsDiffChange(isDiffChange);
    }
  }, [open, beforeRuleDiff, initialTargeting, publishTargeting]);

  return (
    <Form onSubmit={handleSubmit(onSubmit, onError)} autoComplete="off" ref={formRef}>
      <div className={`${styles.status}`}>
        <div className={`${styles['joyride-status']} joyride-toggle-status`}>
          <SectionTitle title={intl.formatMessage({ id: 'targeting.status.text' })} />
          <div className={styles['toggle-status']}>
            <Radio
              size="mini"
              toggle
              checked={!toggleDisabled}
              onChange={(e: SyntheticEvent, data: CheckboxProps) => saveToggleDisable(!data.checked || false)}
              className={styles['info-toggle-status']}
              disabled={disabled}
            />
          </div>
          {toggleDisabled ? (
            <div className={styles['status-text']}>
              <span>
                <FormattedMessage id="targeting.status.disabled.text" />
              </span>
              <span
                className={styles['name-color']}
                style={{ background: VariationColors[Number(disabledServe.select) % 20] }}
              ></span>
              <span className={styles['name-text']}>{disabledText}</span>
            </div>
          ) : (
            <div className={styles['status-text']}>
              <FormattedMessage id="common.enabled.text" />
            </div>
          )}
        </div>
      </div>

      <div className={styles.variations}>
        <SectionTitle
          title={intl.formatMessage({ id: 'common.variations.text' })}
          showTooltip={true}
          tooltipText={intl.formatMessage({ id: 'toggles.variations.tips' })}
        />
        <Variations
          disabled={disabled}
          returnType={toggleInfo?.returnType || ''}
          hooksFormContainer={hooksFormContainer}
          variationContainer={variationContainer}
          ruleContainer={ruleContainer}
          defaultServeContainer={defaultServeContainer}
        />
      </div>
      <div className={styles.rules}>
        <Rules
          disabled={disabled}
          useSegment={true}
          ruleContainer={ruleContainer}
          variationContainer={variationContainer}
          hooksFormContainer={hooksFormContainer}
          segmentContainer={segmentContainer}
        />
        <DefaultRule disabled={disabled} />
      </div>
      <div className={styles['disabled-return']}>
        <DisabledServe disabled={disabled} />
      </div>
      <div id="footer" className={styles.footer}>
        <EventTracker category="targeting" action="publish-toggle">
          <Button
            className={styles['publish-btn']}
            disabled={publishDisabled || disabled || isLoading}
            primary
            type="submit"
          >
            {isLoading && <Loader inverted active inline size="tiny" className={styles['publish-btn-loader']} />}
            <span className={styles['publish-btn-text']}>
              {approvalInfo?.enableApproval ? (
                <FormattedMessage id="common.request.approval.text" />
              ) : (
                <FormattedMessage id="common.publish.text" />
              )}
            </span>
          </Button>
        </EventTracker>
      </div>
      <Modal open={open} width={800} handleCancel={handlePublishCancel} handleConfirm={handlePublishConfirm}>
        <div>
          <div className={styles['modal-header']}>
            <span className={styles['modal-header-text']}>
              <FormattedMessage id="targeting.publish.modal.title" />
            </span>
            <Icon customclass={styles['modal-close-icon']} type="close" onClick={handlePublishCancel} />
          </div>
          <div className={styles['modal-content']}>
            {
              isDiffChange && trackEvents && (
                <div className={styles['publish-tips']}>
                  <Icon type='error-circle' customclass={styles['error-circle']} />
                  <FormattedMessage id='targeting.publish.tips' />
                </div>
              )
            }
            <Diff
              sections={[
                {
                  before: {
                    disabled: initialTargeting?.disabled,
                  },
                  after: {
                    disabled: publishTargeting?.disabled,
                  },
                  title: intl.formatMessage({ id: 'targeting.status.text' }),
                  renderContent: (content) => {
                    return <DiffStatusContent content={content} />;
                  },
                  diffKey: 'status',
                },
                {
                  before: initialTargeting?.content.variations,
                  after: publishTargeting?.content.variations,
                  title: intl.formatMessage({ id: 'common.variations.text' }),
                  renderContent: (content) => {
                    return <VariationsDiffContent content={content} />;
                  },
                  diffKey: 'variations',
                },
                {
                  before: initialTargeting?.content.rules,
                  after: publishTargeting?.content.rules,
                  title: intl.formatMessage({ id: 'common.rules.text' }),
                  renderContent: (content) => {
                    return <RulesDiffContent content={content} />;
                  },
                  beforeDiff: beforeRuleDiff,
                  diffKey: 'rules',
                },
                {
                  before: initialTargeting?.content.defaultServe,
                  after: publishTargeting?.content.defaultServe,
                  title: intl.formatMessage({ id: 'targeting.default.rule' }),
                  renderContent: (content) => {
                    return <DiffServe content={content} />;
                  },
                  beforeDiff: beforeServeDiff,
                  diffKey: 'default',
                },
                {
                  title: intl.formatMessage({ id: 'common.disabled.return.type.text' }),
                  before: initialTargeting?.content.disabledServe,
                  after: publishTargeting?.content.disabledServe,
                  renderContent: (content) => {
                    return <DiffServe content={content} />;
                  },
                  beforeDiff: beforeServeDiff,
                  diffKey: 'disabled',
                },
              ]}
              maxHeight={341}
            />
            <div className={styles['diff-after']}>
              <Form>
                {approvalInfo?.enableApproval && (
                  <div className={styles.approval}>
                    <div className={styles['approval-title']}>
                      <FormattedMessage id="toggles.settings.approval.reviewers" />:
                      <Popup
                        inverted
                        trigger={<Icon type="info" customclass={styles['icon-info']} />}
                        content={intl.formatMessage({ id: 'targeting.approval.tips' })}
                        position="top center"
                        className="popup-override"
                      />
                    </div>
                    <div className={styles['approval-content']}>
                      <Dropdown
                        fluid
                        multiple
                        value={approvalInfo?.reviewers}
                        options={options}
                        renderLabel={renderLabel}
                        icon={null}
                        disabled={true}
                        className={styles['approval-dropdown']}
                      />
                      <div className={styles['approval-btn']} onClick={handleGotoSetting}>
                        <FormattedMessage id="common.toggle.approval.settings.text" />
                      </div>
                    </div>
                  </div>
                )}
                
                {
                  !approvalInfo?.enableApproval && allowEnableTrackEvents && (
                    <div className={styles.collect}>
                      <div className={styles['collect-title']}>
                        <span className="label-required">*</span>
                        <FormattedMessage id='targeting.publish.start.collect' />
                      </div>
                      <div className={styles['collect-content']}>
                        <Form.Field className={styles['collect-radio']}>
                          <Form.Radio
                            label={intl.formatMessage({id: 'common.yes.text'})}
                            name='radioGroup'
                            value='yes'
                            checked={isCollect === 'yes'}
                            error={newFormState.errors.radioGroup ? true : false}
                            onChange={async (e: SyntheticEvent, detail: RadioProps) => {
                              handleRadioChange(e, detail);
                              newSetValue(detail.name || 'radioGroup', detail.value);
                              await newTrigger('radioGroup');
                            }}
                          />
                        </Form.Field>
                        <Form.Field>
                          <Form.Radio
                            label={intl.formatMessage({id: 'common.no.text'})}
                            name='radioGroup'
                            value='no'
                            checked={isCollect === 'no'}
                            error={newFormState.errors.radioGroup ? true : false}
                            onChange={async (e: SyntheticEvent, detail: RadioProps) => {
                              handleRadioChange(e, detail);
                              newSetValue(detail.name || 'radioGroup', detail.value);
                              await newTrigger('radioGroup');
                            }}
                          />
                        </Form.Field>
                      </div>
                      {newFormState.errors.radioGroup && (
                        <div className="error-text">
                          <FormattedMessage id="analysis.select.placeholder" />
                        </div>
                      )}
                    </div>
                  )
                }

                <div className={styles.comment}>
                  <div className={styles['comment-title']}>
                    {approvalInfo?.enableApproval && <span className="label-required">*</span>}
                    <FormattedMessage id="targeting.publish.modal.comment" />:
                  </div>
                  <div className={styles['comment-content']}>
                    <Form.TextArea
                      name="reason"
                      error={newFormState.errors.reason ? true : false}
                      className={styles['comment-input']}
                      placeholder={intl.formatMessage({ id: 'common.input.placeholder' })}
                      onChange={async (e: SyntheticEvent, detail: TextAreaProps) => {
                        handleInputComment(e, detail);
                        newSetValue(detail.name, detail.value);
                        await newTrigger('reason');
                      }}
                    />
                    {newFormState.errors.reason && (
                      <div className="error-text">
                        <FormattedMessage id="common.input.placeholder" />
                      </div>
                    )}
                  </div>
                </div>
              </Form>
            </div>
          </div>
        </div>
      </Modal>
      <Prompt when={!publishDisabled} message={intl.formatMessage({ id: 'targeting.page.leave.text' })} />
      <Joyride
        run={run}
        callback={handleJoyrideCallback}
        stepIndex={stepIndex}
        continuous
        hideCloseButton
        scrollToFirstStep
        showProgress={false}
        showSkipButton
        scrollOffset={100}
        disableCloseOnEsc={true}
        steps={STEPS}
        locale={{
          back: intl.formatMessage({ id: 'guide.last' }),
          next: intl.formatMessage({ id: 'guide.next' }),
          last: intl.formatMessage({ id: 'guide.done' }),
        }}
        floaterProps={{ ...floaterStyle }}
        styles={{ ...tourStyle }}
      />
    </Form>
  );
});

export default Targeting;
